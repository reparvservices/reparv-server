import db from "#db";

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

const query = (sql, params, cb) => db.query(sql, params, cb);

const normaliseRole = (role) => {
  const map = {
    "Sales Person": "sales_partner",
    "Territory Person": "territory_partner",
    "Project Person": "project_partner",
    sales: "sales_partner",
    territory: "territory_partner",
    project: "project_partner",
    sales_partner: "sales_partner",
    territory_partner: "territory_partner",
    project_partner: "project_partner",
    "Sales Partner": "sales_partner",
    "Territory Partner": "territory_partner",
    "Project Partner": "project_partner",
    "sales person": "sales_partner",
    "territory person": "territory_partner",
    "project person": "project_partner",
    "sales partner": "sales_partner",
    "territory partner": "territory_partner",
    "project partner": "project_partner",
  };
  return map[role] || map[role?.toLowerCase?.()] || null;
};

const getActor = (req) => {
  const rawId = req.body?.user_id ?? req.query?.user_id;
  const rawRole = req.body?.user_role ?? req.query?.user_role;
  const id = parseInt(rawId);
  const role = normaliseRole(rawRole);

  console.log(
    `[getActor] rawId=${rawId} rawRole=${rawRole} → id=${id} role=${role}`,
  );

  if (!id || isNaN(id))
    throw Object.assign(new Error("user_id is required"), { status: 400 });
  if (!role)
    throw Object.assign(new Error("user_role is required or invalid"), {
      status: 400,
    });

  return { id, role };
};

const ROLE_TABLE = {
  sales_partner: {
    table: "salespersons",
    pkCol: "salespersonsid",
    nameCol: "fullname",
    imgCol: "userimage",
  },
  territory_partner: {
    table: "territorypartner",
    pkCol: "id",
    nameCol: "fullname",
    imgCol: "userimage",
  },
  project_partner: {
    table: "projectpartner",
    pkCol: "id",
    nameCol: "fullname",
    imgCol: "userimage",
  },
};

// Only select columns that are safe across all three tables
const PROFILE_COLS = [
  "fullname",
  "contact",
  "email",
  "userimage",
  "username",
  "shortBio",
  "bio",
  "companyName",
  "location",
  "website",
  "displayRole",

  "whatsappNumber",
  "linkedinUrl",
  "instagramUrl",
  "facebookUrl",
  "twitterUrl",
  "youtubeUrl",
  "telegramUrl",
  "coverImage",
  "territories",
  "BusinessCategories",
  "experience",
  "city",
  "state",
];

const buildSelect = (cfg, extraCols = []) => {
  const cols = [...new Set([...PROFILE_COLS, ...extraCols])];
  const safe = cols.map((c) => `\`${c}\``).join(", ");
  return `\`${cfg.pkCol}\` AS id, ${safe}`;
};

const notify = (conn, payload) => {
  console.log(
    `[notify] type=${payload.type} → recipient=${payload.recipientId}(${payload.recipientRole})`,
  );
  conn.query(
    `INSERT INTO feed_notifications
       (recipient_id, recipient_role, actor_id, actor_role,
        type, reference_id, reference_type, message)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      payload.recipientId,
      payload.recipientRole,
      payload.actorId,
      payload.actorRole,
      payload.type,
      payload.referenceId ?? null,
      payload.referenceType ?? null,
      payload.message ?? null,
    ],
    (err) => {
      if (err) console.warn("[notify] ❌ failed silently:", err.message);
      else console.log("[notify] ✅ inserted");
    },
  );
};

// ═════════════════════════════════════════════════════════════
//  1. TOGGLE FOLLOW / UNFOLLOW
// ═════════════════════════════════════════════════════════════
export const toggleFollow = (req, res) => {
  console.log("\n[toggleFollow] body:", req.body);
  let actor;
  try {
    actor = getActor(req);
  } catch (e) {
    return res
      .status(e.status || 400)
      .json({ success: false, message: e.message });
  }

  const targetId = parseInt(req.body?.target_id ?? req.query?.target_id);
  const targetRole = normaliseRole(
    req.body?.target_role ?? req.query?.target_role,
  );

  console.log(
    `[toggleFollow] actor=${actor.id}(${actor.role}) → target=${targetId}(${targetRole})`,
  );

  if (!targetId || isNaN(targetId))
    return res
      .status(400)
      .json({ success: false, message: "target_id is required." });
  if (!targetRole)
    return res
      .status(400)
      .json({ success: false, message: "target_role is required or invalid." });
  if (targetId === actor.id && targetRole === actor.role)
    return res
      .status(400)
      .json({ success: false, message: "You cannot follow yourself." });

  query(
    `SELECT id FROM feed_follows
     WHERE follower_id=? AND follower_role=? AND following_id=? AND following_role=?`,
    [actor.id, actor.role, targetId, targetRole],
    (err, rows) => {
      if (err) {
        console.error("[toggleFollow] ❌ DB check error:", err.message);
        return res.status(500).json({ success: false, message: err.message });
      }

      if (rows.length) {
        console.log("[toggleFollow] → UNFOLLOW");
        query(
          `DELETE FROM feed_follows
           WHERE follower_id=? AND follower_role=? AND following_id=? AND following_role=?`,
          [actor.id, actor.role, targetId, targetRole],
          (delErr) => {
            if (delErr) {
              console.error(
                "[toggleFollow] ❌ unfollow error:",
                delErr.message,
              );
              return res
                .status(500)
                .json({ success: false, message: delErr.message });
            }
            console.log("[toggleFollow] ✅ unfollowed");
            return res.json({ success: true, following: false });
          },
        );
      } else {
        console.log("[toggleFollow] → FOLLOW");
        db.getConnection((connErr, conn) => {
          if (connErr) {
            console.error("[toggleFollow] ❌ getConnection:", connErr.message);
            return res
              .status(500)
              .json({ success: false, message: connErr.message });
          }

          conn.beginTransaction((txErr) => {
            if (txErr) {
              conn.release();
              console.error(
                "[toggleFollow] ❌ beginTransaction:",
                txErr.message,
              );
              return res
                .status(500)
                .json({ success: false, message: txErr.message });
            }

            const rollback = (e) => {
              console.error("[toggleFollow] ❌ rollback:", e.message);
              conn.rollback(() => {
                conn.release();
                res.status(500).json({ success: false, message: e.message });
              });
            };

            conn.query(
              `INSERT INTO feed_follows (follower_id, follower_role, following_id, following_role)
               VALUES (?,?,?,?)`,
              [actor.id, actor.role, targetId, targetRole],
              (insErr) => {
                if (insErr) return rollback(insErr);

                notify(conn, {
                  recipientId: targetId,
                  recipientRole: targetRole,
                  actorId: actor.id,
                  actorRole: actor.role,
                  type: "follow",
                  referenceId: actor.id,
                  referenceType: "user",
                  message: "started following you.",
                });

                conn.commit((commitErr) => {
                  conn.release();
                  if (commitErr) return rollback(commitErr);
                  console.log("[toggleFollow] ✅ followed");
                  return res
                    .status(201)
                    .json({ success: true, following: true });
                });
              },
            );
          });
        });
      }
    },
  );
};

// ═════════════════════════════════════════════════════════════
//  2. FOLLOW STATUS
// ═════════════════════════════════════════════════════════════
export const getFollowStatus = (req, res) => {
  console.log("\n[getFollowStatus] query:", req.query);
  let actor;
  try {
    actor = getActor(req);
  } catch (e) {
    return res
      .status(e.status || 400)
      .json({ success: false, message: e.message });
  }

  const targetId = parseInt(req.query.target_id);
  const targetRole = normaliseRole(req.query.target_role);

  if (!targetId || !targetRole)
    return res.status(400).json({
      success: false,
      message: "target_id and target_role are required.",
    });

  query(
    `SELECT id FROM feed_follows
     WHERE follower_id=? AND follower_role=? AND following_id=? AND following_role=?`,
    [actor.id, actor.role, targetId, targetRole],
    (err, rows) => {
      if (err) {
        console.error("[getFollowStatus] ❌", err.message);
        return res.status(500).json({ success: false, message: err.message });
      }
      const following = rows.length > 0;
      console.log(`[getFollowStatus] ✅ following=${following}`);
      return res.json({ success: true, following });
    },
  );
};

// ═════════════════════════════════════════════════════════════
//  3. FOLLOW COUNTS
// ═════════════════════════════════════════════════════════════
export const getFollowCounts = (req, res) => {
  console.log("\n[getFollowCounts] query:", req.query);
  let actor;
  try {
    actor = getActor(req);
  } catch (e) {
    return res
      .status(e.status || 400)
      .json({ success: false, message: e.message });
  }

  const countFollowers = new Promise((resolve, reject) =>
    query(
      `SELECT COUNT(*) AS cnt FROM feed_follows WHERE following_id=? AND following_role=?`,
      [actor.id, actor.role],
      (err, rows) => {
        if (err) {
          console.error("[getFollowCounts] ❌ followers:", err.message);
          return reject(err);
        }
        resolve(rows[0].cnt);
      },
    ),
  );

  const countFollowing = new Promise((resolve, reject) =>
    query(
      `SELECT COUNT(*) AS cnt FROM feed_follows WHERE follower_id=? AND follower_role=?`,
      [actor.id, actor.role],
      (err, rows) => {
        if (err) {
          console.error("[getFollowCounts] ❌ following:", err.message);
          return reject(err);
        }
        resolve(rows[0].cnt);
      },
    ),
  );

  Promise.all([countFollowers, countFollowing])
    .then(([followers, following]) => {
      console.log(
        `[getFollowCounts] ✅ followers=${followers} following=${following}`,
      );
      res.json({ success: true, followers, following });
    })
    .catch((err) =>
      res.status(500).json({ success: false, message: err.message }),
    );
};

// ═════════════════════════════════════════════════════════════
//  4. GET FOLLOWERS LIST
// ═════════════════════════════════════════════════════════════
export const getFollowers = (req, res) => {
  console.log("\n[getFollowers] query:", req.query);
  let actor;
  try {
    actor = getActor(req);
  } catch (e) {
    return res
      .status(e.status || 400)
      .json({ success: false, message: e.message });
  }

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 20);
  const offset = (page - 1) * limit;

  query(
    `SELECT follower_id AS person_id, follower_role AS person_role, created_at AS followed_at
     FROM feed_follows
     WHERE following_id=? AND following_role=?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [actor.id, actor.role, limit, offset],
    async (err, rows) => {
      if (err) {
        console.error("[getFollowers] ❌ DB:", err.message);
        return res.status(500).json({ success: false, message: err.message });
      }
      console.log(`[getFollowers] found ${rows.length} rows`);
      if (!rows.length)
        return res.json({
          success: true,
          page,
          limit,
          total: 0,
          followers: [],
        });

      try {
        const followers = await resolveProfiles(
          rows,
          "person_id",
          "person_role",
        );
        console.log(`[getFollowers] ✅ resolved ${followers.length} profiles`);
        return res.json({
          success: true,
          page,
          limit,
          total: followers.length,
          followers,
        });
      } catch (e) {
        console.error("[getFollowers] ❌ resolveProfiles:", e.message);
        return res.status(500).json({ success: false, message: e.message });
      }
    },
  );
};

// ═════════════════════════════════════════════════════════════
//  5. GET FOLLOWING LIST
// ═════════════════════════════════════════════════════════════
export const getFollowing = (req, res) => {
  console.log("\n[getFollowing] query:", req.query);
  let actor;
  try {
    actor = getActor(req);
  } catch (e) {
    return res
      .status(e.status || 400)
      .json({ success: false, message: e.message });
  }

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 20);
  const offset = (page - 1) * limit;

  query(
    `SELECT following_id AS person_id, following_role AS person_role, created_at AS followed_at
     FROM feed_follows
     WHERE follower_id=? AND follower_role=?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [actor.id, actor.role, limit, offset],
    async (err, rows) => {
      if (err) {
        console.error("[getFollowing] ❌ DB:", err.message);
        return res.status(500).json({ success: false, message: err.message });
      }
      console.log(`[getFollowing] found ${rows.length} rows`);
      if (!rows.length)
        return res.json({
          success: true,
          page,
          limit,
          total: 0,
          following: [],
        });

      try {
        const following = await resolveProfiles(
          rows,
          "person_id",
          "person_role",
        );
        console.log(`[getFollowing] ✅ resolved ${following.length} profiles`);
        return res.json({
          success: true,
          page,
          limit,
          total: following.length,
          following,
        });
      } catch (e) {
        console.error("[getFollowing] ❌ resolveProfiles:", e.message);
        return res.status(500).json({ success: false, message: e.message });
      }
    },
  );
};

// ═════════════════════════════════════════════════════════════
//  6. GET USER PROFILE
// ═════════════════════════════════════════════════════════════
export const getUserProfile = (req, res) => {
  console.log("\n[getUserProfile] query:", req.query);
  let actor;
  try {
    actor = getActor(req);
  } catch (e) {
    return res
      .status(e.status || 400)
      .json({ success: false, message: e.message });
  }

  const targetId = parseInt(req.query.target_id);
  const targetRole = normaliseRole(req.query.target_role);

  console.log(`[getUserProfile] target=${targetId}(${targetRole})`);

  if (!targetId || !targetRole)
    return res.status(400).json({
      success: false,
      message: "target_id and target_role are required.",
    });

  const cfg = ROLE_TABLE[targetRole];
  if (!cfg)
    return res.status(400).json({ success: false, message: "Unknown role." });

  const selectCols = buildSelect(cfg);
  console.log(`[getUserProfile] table=${cfg.table} pk=${cfg.pkCol}`);

  query(
    `SELECT ${selectCols} FROM \`${cfg.table}\` WHERE \`${cfg.pkCol}\` = ?`,
    [targetId],
    (err, rows) => {
      if (err) {
        console.error("[getUserProfile] ❌ profile fetch:", err.message);
        return res.status(500).json({ success: false, message: err.message });
      }
      if (!rows.length) {
        console.warn("[getUserProfile] ⚠️ user not found");
        return res
          .status(404)
          .json({ success: false, message: "User not found." });
      }

      const profile = rows[0];
      console.log(`[getUserProfile] ✅ profile found: ${profile.fullname}`);

      const followerCount = new Promise((resolve, reject) =>
        query(
          `SELECT COUNT(*) AS cnt FROM feed_follows WHERE following_id=? AND following_role=?`,
          [targetId, targetRole],
          (e, r) => (e ? reject(e) : resolve(r[0].cnt)),
        ),
      );

      const followingCount = new Promise((resolve, reject) =>
        query(
          `SELECT COUNT(*) AS cnt FROM feed_follows WHERE follower_id=? AND follower_role=?`,
          [targetId, targetRole],
          (e, r) => (e ? reject(e) : resolve(r[0].cnt)),
        ),
      );

      const isFollowing = new Promise((resolve, reject) =>
        query(
          `SELECT id FROM feed_follows
               WHERE follower_id=? AND follower_role=? AND following_id=? AND following_role=?`,
          [actor.id, actor.role, targetId, targetRole],
          (e, r) => (e ? reject(e) : resolve(r.length > 0)),
        ),
      );

      Promise.all([followerCount, followingCount, isFollowing])
        .then(([followers, following, is_following]) => {
          console.log(
            `[getUserProfile] ✅ followers=${followers} following=${following} is_following=${is_following}`,
          );
          return res.json({
            success: true,
            profile: {
              ...profile,
              role: targetRole,
              followers,
              following,
              is_following,
            },
          });
        })
        .catch((e) => {
          console.error("[getUserProfile] ❌ counts:", e.message);
          res.status(500).json({ success: false, message: e.message });
        });
    },
  );
};

// ═════════════════════════════════════════════════════════════
//  7. SEARCH USERS
// ═════════════════════════════════════════════════════════════
// ═════════════════════════════════════════════════════════════
//  REPLACE searchUsers in FollowController.js with this version
//  Fix: "Illegal mix of collations for operation 'UNION'"
//  Solution: CONVERT each string column to utf8mb4 + explicit COLLATE
// ═════════════════════════════════════════════════════════════

export const searchUsers = (req, res) => {
  console.log("\n[searchUsers] query:", req.query);

  let actor;
  try {
    actor = getActor(req);
  } catch (e) {
    return res
      .status(e.status || 400)
      .json({ success: false, message: e.message });
  }

  const q = (req.query.q || "").trim();
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 20);
  const offset = (page - 1) * limit;

  console.log(
    `[searchUsers] q="${q}" page=${page} limit=${limit} offset=${offset}`,
  );

  if (!q)
    return res
      .status(400)
      .json({ success: false, message: "Search query (q) is required." });

  const like = `%${q}%`;

  // ── COLLATE CONVERT on every string column fixes the UNION collation mismatch ──
  // Each table may use a different collation (utf8, utf8mb4, latin1 etc.)
  // CONVERT(...USING utf8mb4) COLLATE utf8mb4_unicode_ci normalises them all.
  const CONV = (col) =>
    `CONVERT(${col} USING utf8mb4) COLLATE utf8mb4_unicode_ci`;

  const sql = `
    SELECT
      salespersonsid                      AS id,
      'sales_partner'                     AS role,
      ${CONV("fullname")}                 AS fullname,
      ${CONV("userimage")}                AS userimage,
      ${CONV("username")}                 AS username,
      ${CONV("displayRole")}              AS displayRole,
      ${CONV("location")}                 AS location,
      ${CONV("companyName")}              AS companyName
    FROM salespersons
    WHERE (
        ${CONV("fullname")}  LIKE ? OR
        ${CONV("username")}  LIKE ? OR
        ${CONV("email")}     LIKE ?
    )

    UNION ALL

    SELECT
      id                                  AS id,
      'territory_partner'                 AS role,
      ${CONV("fullname")}                 AS fullname,
      ${CONV("userimage")}                AS userimage,
      ${CONV("username")}                 AS username,
      ${CONV("displayRole")}              AS displayRole,
      ${CONV("location")}                 AS location,
      ${CONV("companyName")}              AS companyName
    FROM territorypartner
    WHERE (
        ${CONV("fullname")}  LIKE ? OR
        ${CONV("username")}  LIKE ? OR
        ${CONV("email")}     LIKE ?
    )

    UNION ALL

    SELECT
      id                                  AS id,
      'project_partner'                   AS role,
      ${CONV("fullname")}                 AS fullname,
      ${CONV("userimage")}                AS userimage,
      ${CONV("username")}                 AS username,
      ${CONV("displayRole")}              AS displayRole,
      ${CONV("location")}                 AS location,
      ${CONV("companyName")}              AS companyName
    FROM projectpartner
    WHERE (
        ${CONV("fullname")}  LIKE ? OR
        ${CONV("username")}  LIKE ? OR
        ${CONV("email")}     LIKE ?
    )

    LIMIT ? OFFSET ?
  `;

  console.log(`[searchUsers] running UNION query with like="${like}"`);

  query(
    sql,
    [
      like,
      like,
      like, // salespersons
      like,
      like,
      like, // territorypartner
      like,
      like,
      like, // projectpartner
      limit,
      offset,
    ],
    async (err, rows) => {
      if (err) {
        console.error("[searchUsers] ❌ DB UNION error:", err.message);
        return res.status(500).json({ success: false, message: err.message });
      }

      console.log(`[searchUsers] raw rows returned: ${rows.length}`);

      if (!rows.length) {
        console.log("[searchUsers] ✅ no results");
        return res.json({ success: true, users: [] });
      }

      // Attach is_following for each result
      try {
        const withFollow = await Promise.all(
          rows.map(
            (u) =>
              new Promise((resolve, reject) =>
                query(
                  `SELECT id FROM feed_follows
                 WHERE follower_id=? AND follower_role=? AND following_id=? AND following_role=?`,
                  [actor.id, actor.role, u.id, u.role],
                  (e, r) => {
                    if (e) {
                      console.error(
                        `[searchUsers] ❌ follow check for ${u.id}:`,
                        e.message,
                      );
                      return reject(e);
                    }
                    resolve({ ...u, is_following: r.length > 0 });
                  },
                ),
              ),
          ),
        );
        console.log(`[searchUsers] ✅ returning ${withFollow.length} users`);
        return res.json({ success: true, users: withFollow });
      } catch (e) {
        console.error("[searchUsers] ❌ follow check batch error:", e.message);
        return res.status(500).json({ success: false, message: e.message });
      }
    },
  );
};

// ═════════════════════════════════════════════════════════════
//  INTERNAL: resolveProfiles
// ═════════════════════════════════════════════════════════════
const resolveProfiles = (rows, idKey, roleKey) => {
  return Promise.all(
    rows.map((row) => {
      const cfg = ROLE_TABLE[row[roleKey]];
      if (!cfg) {
        console.warn(`[resolveProfiles] ⚠️ unknown role: ${row[roleKey]}`);
        return Promise.resolve({
          id: row[idKey],
          role: row[roleKey],
          followed_at: row.followed_at,
        });
      }

      const selectCols = buildSelect(cfg);
      console.log(`[resolveProfiles] fetching ${cfg.table} pk=${row[idKey]}`);

      return new Promise((resolve, reject) =>
        query(
          `SELECT ${selectCols} FROM \`${cfg.table}\` WHERE \`${cfg.pkCol}\` = ?`,
          [row[idKey]],
          (err, profileRows) => {
            if (err) {
              console.error(
                `[resolveProfiles] ❌ ${cfg.table} id=${row[idKey]}:`,
                err.message,
              );
              return reject(err);
            }
            const profile = profileRows[0] || {};
            console.log(`[resolveProfiles] ✅ resolved: ${profile.fullname}`);
            resolve({
              ...profile,
              role: row[roleKey],
              followed_at: row.followed_at,
            });
          },
        ),
      );
    }),
  );
};
