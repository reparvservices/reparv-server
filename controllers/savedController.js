import db from "../config/dbconnect.js";

// ─────────────────────────────────────────────────────────────
// HELPERS  (same as feedController)
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
    "[getActor]",
    "| user_id   :",
    rawId,
    "| user_role :",
    rawRole,
    "| resolved id   :",
    id,
    "| resolved role :",
    role,
  );

  if (!id || isNaN(id)) {
    console.warn("[getActor] ❌ Missing user_id — rawId:", rawId);
    throw Object.assign(new Error("user_id is required"), { status: 400 });
  }
  if (!role) {
    console.warn("[getActor] ❌ Could not resolve role — rawRole:", rawRole);
    throw Object.assign(new Error("user_role is required or invalid"), {
      status: 400,
    });
  }

  return { id, role };
};

// ─────────────────────────────────────────────────────────────
// TABLE DEFINITION  (run once)
// ─────────────────────────────────────────────────────────────
//
//  CREATE TABLE IF NOT EXISTS feed_saved_posts (
//    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
//    user_id      INT UNSIGNED     NOT NULL,
//    user_role    VARCHAR(30)      NOT NULL,
//    post_id      INT UNSIGNED     NOT NULL,
//    saved_at     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
//
//    UNIQUE KEY uq_save (user_id, user_role, post_id),
//    INDEX idx_user  (user_id, user_role),
//    INDEX idx_post  (post_id)
//  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
//
// ─────────────────────────────────────────────────────────────

// ═════════════════════════════════════════════════════════════
//  TOGGLE SAVE  — POST /api/feed/posts/:id/save
//  Body: { user_id, user_role }
//  Returns: { success, saved: true|false }
// ═════════════════════════════════════════════════════════════

export const toggleSavePost = (req, res) => {
  let actor;
  try {
    actor = getActor(req);
  } catch (e) {
    return res
      .status(e.status || 400)
      .json({ success: false, message: e.message });
  }

  const postId = parseInt(req.params.id);
  if (!postId || isNaN(postId)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid post_id." });
  }

  // 1. Check post exists and is not deleted
  query(
    "SELECT id FROM feed_posts WHERE id = ? AND is_deleted = 0",
    [postId],
    (err, postRows) => {
      if (err)
        return res.status(500).json({ success: false, message: err.message });
      if (!postRows.length) {
        return res
          .status(404)
          .json({ success: false, message: "Post not found." });
      }

      // 2. Check if already saved
      query(
        "SELECT id FROM feed_saved_posts WHERE user_id = ? AND user_role = ? AND post_id = ?",
        [actor.id, actor.role, postId],
        (err2, saveRows) => {
          if (err2)
            return res
              .status(500)
              .json({ success: false, message: err2.message });

          if (saveRows.length) {
            // ── Already saved → UNSAVE ──
            query(
              "DELETE FROM feed_saved_posts WHERE user_id = ? AND user_role = ? AND post_id = ?",
              [actor.id, actor.role, postId],
              (delErr) => {
                if (delErr)
                  return res
                    .status(500)
                    .json({ success: false, message: delErr.message });
                console.log(
                  `[toggleSavePost] ✅ unsaved  post_id=${postId} by ${actor.id}(${actor.role})`,
                );
                return res.json({ success: true, saved: false });
              },
            );
          } else {
            // ── Not saved → SAVE ──
            query(
              "INSERT INTO feed_saved_posts (user_id, user_role, post_id) VALUES (?,?,?)",
              [actor.id, actor.role, postId],
              (insErr) => {
                if (insErr)
                  return res
                    .status(500)
                    .json({ success: false, message: insErr.message });
                console.log(
                  `[toggleSavePost] ✅ saved    post_id=${postId} by ${actor.id}(${actor.role})`,
                );
                return res.status(201).json({ success: true, saved: true });
              },
            );
          }
        },
      );
    },
  );
};

// ═════════════════════════════════════════════════════════════
//  GET SAVE STATUS  — GET /api/feed/posts/:id/save?user_id&user_role
//  Returns: { success, saved: true|false }
// ═════════════════════════════════════════════════════════════

export const getSaveStatus = (req, res) => {
  let actor;
  try {
    actor = getActor(req);
  } catch (e) {
    return res
      .status(e.status || 400)
      .json({ success: false, message: e.message });
  }

  const postId = parseInt(req.params.id);
  if (!postId || isNaN(postId)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid post_id." });
  }

  query(
    "SELECT id FROM feed_saved_posts WHERE user_id = ? AND user_role = ? AND post_id = ?",
    [actor.id, actor.role, postId],
    (err, rows) => {
      if (err)
        return res.status(500).json({ success: false, message: err.message });
      return res.json({ success: true, saved: rows.length > 0 });
    },
  );
};

// ═════════════════════════════════════════════════════════════
//  GET MY SAVED POSTS  — GET /api/feed/saved?user_id&user_role&page&limit
//  Returns full post rows (same shape as getFeedPosts) with has_liked + author info
// ═════════════════════════════════════════════════════════════

export const getMySavedPosts = (req, res) => {
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

  console.log(
    `[getMySavedPosts] actor=${actor.id}(${actor.role}) page=${page}`,
  );

  query(
    `SELECT
       p.*,

       sp.saved_at,

       -- has current user liked this post
       EXISTS(
         SELECT 1 FROM feed_post_likes l
         WHERE l.post_id   = p.id
           AND l.user_id   = ?
           AND l.user_role = ?
       ) AS has_liked,

       -- always saved = true for this endpoint
       1 AS is_saved,

       -- author name
       CASE
         WHEN p.author_role = 'project_partner'
           THEN (SELECT fullname FROM projectpartner   WHERE id             = p.author_id)
         WHEN p.author_role = 'sales_partner'
           THEN (SELECT fullname FROM salespersons     WHERE salespersonsid = p.author_id)
         WHEN p.author_role = 'territory_partner'
           THEN (SELECT fullname FROM territorypartner WHERE id             = p.author_id)
         ELSE NULL
       END AS author_name,

       -- author image
       CASE
         WHEN p.author_role = 'project_partner'
           THEN (SELECT userimage FROM projectpartner   WHERE id             = p.author_id)
         WHEN p.author_role = 'sales_partner'
           THEN (SELECT userimage FROM salespersons     WHERE salespersonsid = p.author_id)
         WHEN p.author_role = 'territory_partner'
           THEN (SELECT userimage FROM territorypartner WHERE id             = p.author_id)
         ELSE NULL
       END AS author_image

     FROM feed_saved_posts sp
     JOIN feed_posts p ON p.id = sp.post_id AND p.is_deleted = 0
     WHERE sp.user_id   = ?
       AND sp.user_role = ?
     ORDER BY sp.saved_at DESC
     LIMIT ? OFFSET ?`,
    [actor.id, actor.role, actor.id, actor.role, limit, offset],
    (err, posts) => {
      if (err) {
        console.error("[getMySavedPosts] DB error:", err.message);
        return res.status(500).json({ success: false, message: err.message });
      }
      console.log(`[getMySavedPosts] returning ${posts.length} saved posts`);
      return res.json({
        success: true,
        page,
        limit,
        total: posts.length,
        posts,
      });
    },
  );
};

// ═════════════════════════════════════════════════════════════
//  DELETE SAVED POST  — DELETE /api/feed/saved/:id
//  Body or Query: { user_id, user_role }
//  :id = post_id (not the save-row id)
// ═════════════════════════════════════════════════════════════

export const removeSavedPost = (req, res) => {
  let actor;
  try {
    actor = getActor(req);
  } catch (e) {
    return res
      .status(e.status || 400)
      .json({ success: false, message: e.message });
  }

  const postId = parseInt(req.params.id);
  if (!postId || isNaN(postId)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid post_id." });
  }

  query(
    "SELECT id FROM feed_saved_posts WHERE user_id = ? AND user_role = ? AND post_id = ?",
    [actor.id, actor.role, postId],
    (err, rows) => {
      if (err)
        return res.status(500).json({ success: false, message: err.message });
      if (!rows.length) {
        return res
          .status(404)
          .json({ success: false, message: "Saved post not found." });
      }

      query(
        "DELETE FROM feed_saved_posts WHERE user_id = ? AND user_role = ? AND post_id = ?",
        [actor.id, actor.role, postId],
        (delErr) => {
          if (delErr)
            return res
              .status(500)
              .json({ success: false, message: delErr.message });
          console.log(
            `[removeSavedPost] ✅ removed post_id=${postId} for ${actor.id}(${actor.role})`,
          );
          return res.json({ success: true });
        },
      );
    },
  );
};
