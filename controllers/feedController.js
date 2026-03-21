import db from "../config/dbconnect.js";

// ─────────────────────────────────────────────────────────────
// ROLE NORMALISATION
// JWT confirmed role: "Sales Person" | "Territory Person" | "Project Person"
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

const ROLE_TAG_DEFAULTS = {
  sales_partner: { tag_color: "#E9407A", tag_bg: "#FFD6E7" },
  territory_partner: { tag_color: "#0078DB", tag_bg: "#DBEAFE" },
  project_partner: { tag_color: "#7C3AED", tag_bg: "#EDE9FE" },
};

const query = (sql, params, cb) => db.query(sql, params, cb);

const normaliseRole = (role) => {
  const map = {
    // Exact values from Redux / JWT payload
    "Sales Person": "sales_partner",
    "Territory Person": "territory_partner",
    "Project Person": "project_partner",
    // Short labels
    sales: "sales_partner",
    territory: "territory_partner",
    project: "project_partner",
    // Full DB enums (pass-through)
    sales_partner: "sales_partner",
    territory_partner: "territory_partner",
    project_partner: "project_partner",
    // Old "Partner" variants
    "Sales Partner": "sales_partner",
    "Territory Partner": "territory_partner",
    "Project Partner": "project_partner",
    // Lowercase catch-all
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
  // Body takes priority (POST), fall back to query (GET)
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

const notify = (conn, payload) => {
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
      if (err) console.warn("[notify] failed silently:", err.message);
    },
  );
};

// ═════════════════════════════════════════════════════════════
//  FEED POSTS
// ═════════════════════════════════════════════════════════════

export const getUserPosts = (req, res) => {
  let actor;
  try {
    actor = getActor(req);
  } catch (e) {
    return res
      .status(e.status || 400)
      .json({ success: false, message: e.message });
  }

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 10);
  const offset = (page - 1) * limit;

  query(
    `SELECT
       p.*,

       -- always false for own posts, but kept for consistency
       EXISTS(
         SELECT 1 FROM feed_post_likes l
         WHERE l.post_id = p.id
           AND l.user_id   = ?
           AND l.user_role = ?
       ) AS has_liked,

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

     FROM feed_posts p
     WHERE p.is_deleted  = 0
       AND p.author_id   = ?
       AND p.author_role = ?
     ORDER BY p.created_at DESC
     LIMIT ? OFFSET ?`,
    [actor.id, actor.role, actor.id, actor.role, limit, offset],
    (err, posts) => {
      if (err)
        return res.status(500).json({ success: false, message: err.message });
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

// GET /api/feed/posts?user_id&user_role&page&limit
export const getFeedPosts = (req, res) => {
  let actor;
  try {
    actor = getActor(req);
  } catch (e) {
    return res
      .status(e.status || 400)
      .json({ success: false, message: e.message });
  }

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 30);
  const offset = (page - 1) * limit;

  console.log(`[getFeedPosts] actor=${actor.id}(${actor.role}) page=${page}`);

  query(
    `SELECT
       p.*,

       -- has current user liked this post
       EXISTS(
         SELECT 1 FROM feed_post_likes l
         WHERE l.post_id = p.id
           AND l.user_id   = ?
           AND l.user_role = ?
       ) AS has_liked,

       -- author name: pick the right table based on author_role
       CASE
         WHEN p.author_role = 'project_partner'
           THEN (SELECT fullname FROM projectpartner  WHERE id               = p.author_id)
         WHEN p.author_role = 'sales_partner'
           THEN (SELECT fullname FROM salespersons    WHERE salespersonsid   = p.author_id)
         WHEN p.author_role = 'territory_partner'
           THEN (SELECT fullname FROM territorypartner WHERE id              = p.author_id)
         ELSE NULL
       END AS author_name,

       -- author profile image: same pattern
       CASE
         WHEN p.author_role = 'project_partner'
           THEN (SELECT userimage FROM projectpartner   WHERE id               = p.author_id)
         WHEN p.author_role = 'sales_partner'
           THEN (SELECT userimage FROM salespersons     WHERE salespersonsid   = p.author_id)
         WHEN p.author_role = 'territory_partner'
           THEN (SELECT userimage FROM territorypartner WHERE id               = p.author_id)
         ELSE NULL
       END AS author_image

     FROM feed_posts p
     WHERE p.is_deleted = 0
       AND (p.visibility = 'all' OR p.visibility = ? OR p.author_role = ?)
     ORDER BY p.created_at DESC
     LIMIT ? OFFSET ?`,
    [actor.id, actor.role, actor.role, actor.role, limit, offset],
    (err, posts) => {
      if (err) {
        console.error("[getFeedPosts] DB error:", err.message);
        return res.status(500).json({ success: false, message: err.message });
      }
      console.log(`[getFeedPosts] returning ${posts.length} posts`);
      return res.json({ success: true, page, limit, posts });
    },
  );
};

// POST /api/feed/posts
// Body: { user_id, user_role, post_type, content, tag_label, tag_color, tag_bg, visibility, media_urls }
export const createPost = (req, res) => {
  let actor;
  try {
    actor = getActor(req);
  } catch (e) {
    return res
      .status(e.status || 400)
      .json({ success: false, message: e.message });
  }

  const {
    post_type = "text",
    content,
    tag_label,
    tag_color,
    tag_bg,
    visibility = "all",
    media_urls,
  } = req.body;

  console.log("[createPost] body:", JSON.stringify(req.body, null, 2));

  // Parse media_urls — handles array / JSON string / plain URL string
  let parsedUrls = [];
  if (media_urls) {
    if (Array.isArray(media_urls)) {
      parsedUrls = media_urls.filter(Boolean);
    } else {
      try {
        const parsed = JSON.parse(media_urls);
        parsedUrls = Array.isArray(parsed)
          ? parsed.filter(Boolean)
          : [parsed].filter(Boolean);
      } catch {
        parsedUrls = [media_urls].filter(Boolean);
      }
    }
  }

  if (!content?.trim() && parsedUrls.length === 0) {
    return res
      .status(400)
      .json({ success: false, message: "Post must have content or media." });
  }

  const tagDefaults = ROLE_TAG_DEFAULTS[actor.role];
  const mediaUrlsToDb = parsedUrls.length ? JSON.stringify(parsedUrls) : null;
  const thumbnailUrl = req.body.thumbnail_url || parsedUrls[0] || null;

  query(
    `INSERT INTO feed_posts
       (author_id, author_role, post_type, content, media_urls,
        thumbnail_url, tag_label, tag_color, tag_bg, visibility)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      actor.id,
      actor.role,
      post_type,
      content?.trim() || null,
      mediaUrlsToDb,
      thumbnailUrl,
      tag_label || null,
      tag_color || tagDefaults.tag_color,
      tag_bg || tagDefaults.tag_bg,
      visibility,
    ],
    (err, result) => {
      if (err) {
        console.error("[createPost] DB error:", err.message);
        return res.status(500).json({ success: false, message: err.message });
      }
      console.log("[createPost] ✅ inserted post_id:", result.insertId);
      return res.status(201).json({ success: true, post_id: result.insertId });
    },
  );
};

// ─────────────────────────────────────────────────────────────

export const updatePost = (req, res) => {
  let actor;
  try {
    actor = getActor(req);
  } catch (e) {
    return res
      .status(e.status || 400)
      .json({ success: false, message: e.message });
  }

  const { id } = req.params;
  const { content, media_urls, tag_label, tag_color, tag_bg } = req.body;

  // Must have something to update
  if (!content && !media_urls && !tag_label) {
    return res
      .status(400)
      .json({ success: false, message: "Nothing to update." });
  }

  // Ownership check first
  query(
    "SELECT author_id, author_role FROM feed_posts WHERE id = ? AND is_deleted = 0",
    [id],
    (err, rows) => {
      if (err)
        return res.status(500).json({ success: false, message: err.message });
      if (!rows.length)
        return res
          .status(404)
          .json({ success: false, message: "Post not found." });

      const post = rows[0];
      if (post.author_id !== actor.id || post.author_role !== actor.role) {
        return res
          .status(403)
          .json({ success: false, message: "Not your post." });
      }

      // Build SET clause dynamically
      const sets = [];
      const values = [];

      if (content !== undefined) {
        sets.push("content = ?");
        values.push(content?.trim() || null);
      }

      if (media_urls !== undefined) {
        // Parse media_urls — same logic as createPost
        let parsedUrls = [];
        if (Array.isArray(media_urls)) {
          parsedUrls = media_urls.filter(Boolean);
        } else {
          try {
            const parsed = JSON.parse(media_urls);
            parsedUrls = Array.isArray(parsed)
              ? parsed.filter(Boolean)
              : [parsed].filter(Boolean);
          } catch {
            parsedUrls = [media_urls].filter(Boolean);
          }
        }
        const mediaUrlsToDb = parsedUrls.length
          ? JSON.stringify(parsedUrls)
          : null;
        sets.push("media_urls = ?");
        values.push(mediaUrlsToDb);
        // Update thumbnail to first media URL
        sets.push("thumbnail_url = ?");
        values.push(parsedUrls[0] || null);
      }

      if (tag_label !== undefined) {
        sets.push("tag_label = ?");
        values.push(tag_label || null);
      }
      if (tag_color !== undefined) {
        sets.push("tag_color = ?");
        values.push(tag_color);
      }
      if (tag_bg !== undefined) {
        sets.push("tag_bg = ?");
        values.push(tag_bg);
      }

      if (sets.length === 0) {
        return res
          .status(400)
          .json({ success: false, message: "Nothing to update." });
      }

      values.push(id);

      query(
        `UPDATE feed_posts SET ${sets.join(", ")} WHERE id = ?`,
        values,
        (updateErr) => {
          if (updateErr) {
            console.error("[updatePost] DB error:", updateErr.message);
            return res
              .status(500)
              .json({ success: false, message: updateErr.message });
          }
          return res.json({ success: true });
        },
      );
    },
  );
};
// DELETE /api/feed/posts/:id
// Body: { user_id, user_role }
export const deletePost = (req, res) => {
  let actor;
  try {
    actor = getActor(req);
  } catch (e) {
    return res
      .status(e.status || 400)
      .json({ success: false, message: e.message });
  }

  const { id } = req.params;

  query(
    "SELECT author_id, author_role FROM feed_posts WHERE id = ? AND is_deleted = 0",
    [id],
    (err, rows) => {
      if (err)
        return res.status(500).json({ success: false, message: err.message });
      if (!rows.length)
        return res
          .status(404)
          .json({ success: false, message: "Post not found." });

      const post = rows[0];
      if (post.author_id !== actor.id || post.author_role !== actor.role) {
        return res
          .status(403)
          .json({ success: false, message: "Not your post." });
      }

      query(
        "UPDATE feed_posts SET is_deleted = 1 WHERE id = ?",
        [id],
        (err2) => {
          if (err2)
            return res
              .status(500)
              .json({ success: false, message: err2.message });
          return res.json({ success: true });
        },
      );
    },
  );
};

// ─────────────────────────────────────────────────────────────
//  LIKES
// ─────────────────────────────────────────────────────────────

// POST /api/feed/posts/:id/like
// Body: { user_id, user_role }
export const toggleLike = (req, res) => {
  let actor;
  try {
    actor = getActor(req);
  } catch (e) {
    return res
      .status(e.status || 400)
      .json({ success: false, message: e.message });
  }

  const postId = parseInt(req.params.id);

  db.getConnection((connErr, conn) => {
    if (connErr)
      return res.status(500).json({ success: false, message: connErr.message });

    conn.beginTransaction((txErr) => {
      if (txErr) {
        conn.release();
        return res.status(500).json({ success: false, message: txErr.message });
      }

      const rollback = (err) =>
        conn.rollback(() => {
          conn.release();
          res.status(500).json({ success: false, message: err.message });
        });

      conn.query(
        "SELECT id FROM feed_post_likes WHERE post_id=? AND user_id=? AND user_role=?",
        [postId, actor.id, actor.role],
        (err, rows) => {
          if (err) return rollback(err);

          if (rows.length) {
            // Unlike
            conn.query(
              "DELETE FROM feed_post_likes WHERE post_id=? AND user_id=? AND user_role=?",
              [postId, actor.id, actor.role],
              (delErr) => {
                if (delErr) return rollback(delErr);
                conn.query(
                  "UPDATE feed_posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id=?",
                  [postId],
                  (bumpErr) => {
                    if (bumpErr) return rollback(bumpErr);
                    conn.commit((commitErr) => {
                      conn.release();
                      if (commitErr)
                        return res
                          .status(500)
                          .json({ success: false, message: commitErr.message });
                      return res.json({ success: true, liked: false });
                    });
                  },
                );
              },
            );
          } else {
            // Like
            conn.query(
              "INSERT INTO feed_post_likes (post_id, user_id, user_role) VALUES (?,?,?)",
              [postId, actor.id, actor.role],
              (insErr) => {
                if (insErr) return rollback(insErr);
                conn.query(
                  "UPDATE feed_posts SET likes_count = likes_count + 1 WHERE id=?",
                  [postId],
                  (bumpErr) => {
                    if (bumpErr) return rollback(bumpErr);
                    conn.query(
                      "SELECT author_id, author_role FROM feed_posts WHERE id=?",
                      [postId],
                      (selErr, postRows) => {
                        if (selErr) return rollback(selErr);
                        const post = postRows[0];
                        if (post && post.author_id !== actor.id) {
                          notify(conn, {
                            recipientId: post.author_id,
                            recipientRole: post.author_role,
                            actorId: actor.id,
                            actorRole: actor.role,
                            type: "like",
                            referenceId: postId,
                            referenceType: "post",
                            message: "liked your post.",
                          });
                        }
                        conn.commit((commitErr) => {
                          conn.release();
                          if (commitErr)
                            return res.status(500).json({
                              success: false,
                              message: commitErr.message,
                            });
                          return res.json({ success: true, liked: true });
                        });
                      },
                    );
                  },
                );
              },
            );
          }
        },
      );
    });
  });
};

// ─────────────────────────────────────────────────────────────
//  COMMENTS
// ─────────────────────────────────────────────────────────────

export const getComments = (req, res) => {
  const postId = parseInt(req.params.id);
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = 20;
  const offset = (page - 1) * limit;

  query(
    `SELECT
       c.id,
       c.post_id,
       c.parent_id,
       c.author_id,
       c.author_role,
       c.partner_name,
       c.content,
       c.is_deleted,
       c.created_at,

       CASE
         WHEN c.author_role = 'project_partner'
           THEN (SELECT fullname FROM projectpartner   WHERE id             = c.author_id)
         WHEN c.author_role = 'sales_partner'
           THEN (SELECT fullname FROM salespersons     WHERE salespersonsid = c.author_id)
         WHEN c.author_role = 'territory_partner'
           THEN (SELECT fullname FROM territorypartner WHERE id             = c.author_id)
         ELSE c.partner_name
       END AS author_name,

       CASE
         WHEN c.author_role = 'project_partner'
           THEN (SELECT userimage FROM projectpartner   WHERE id             = c.author_id)
         WHEN c.author_role = 'sales_partner'
           THEN (SELECT userimage FROM salespersons     WHERE salespersonsid = c.author_id)
         WHEN c.author_role = 'territory_partner'
           THEN (SELECT userimage FROM territorypartner WHERE id             = c.author_id)
         ELSE NULL
       END AS author_image

     FROM feed_post_comments c
     WHERE c.post_id    = ?
       AND c.parent_id  IS NULL
       AND c.is_deleted = 0
     ORDER BY c.created_at ASC
     LIMIT ? OFFSET ?`,
    [postId, limit, offset],
    (err, comments) => {
      if (err)
        return res.status(500).json({ success: false, message: err.message });
      return res.json({ success: true, comments });
    },
  );
};

// POST /api/feed/posts/:id/comments
// Body: { user_id, user_role, content, parent_id? }
export const addComment = (req, res) => {
  let actor;
  try {
    actor = getActor(req);
  } catch (e) {
    return res
      .status(e.status || 400)
      .json({ success: false, message: e.message });
  }

  const postId = parseInt(req.params.id);
  const { content, parent_id, partner_name } = req.body;
  console.log(req.body);
  if (!content?.trim()) {
    return res
      .status(400)
      .json({ success: false, message: "Comment cannot be empty." });
  }

  db.getConnection((connErr, conn) => {
    if (connErr)
      return res.status(500).json({ success: false, message: connErr.message });

    conn.beginTransaction((txErr) => {
      if (txErr) {
        conn.release();
        return res.status(500).json({ success: false, message: txErr.message });
      }

      const rollback = (err) =>
        conn.rollback(() => {
          conn.release();
          res.status(500).json({ success: false, message: err.message });
        });

      // ✅ INSERT with partner_name
      conn.query(
        `INSERT INTO feed_post_comments 
        (post_id, parent_id, author_id, author_role, partner_name, content) 
        VALUES (?,?,?,?,?,?)`,
        [
          postId,
          parent_id ?? null,
          actor.id,
          actor.role,
          partner_name || "", // fallback if not provided
          content.trim(),
        ],
        (insErr, result) => {
          if (insErr) return rollback(insErr);

          // ✅ Update comment count
          conn.query(
            "UPDATE feed_posts SET comments_count = comments_count + 1 WHERE id=?",
            [postId],
            (bumpErr) => {
              if (bumpErr) return rollback(bumpErr);

              // ✅ Get post owner
              conn.query(
                "SELECT author_id, author_role FROM feed_posts WHERE id=?",
                [postId],
                (selErr, postRows) => {
                  if (selErr) return rollback(selErr);

                  const post = postRows[0];

                  // ✅ Notification
                  if (post && post.author_id !== actor.id) {
                    notify(conn, {
                      recipientId: post.author_id,
                      recipientRole: post.author_role,
                      actorId: actor.id,
                      actorRole: actor.role,
                      type: "comment",
                      referenceId: postId,
                      referenceType: "post",
                      message: `${partner_name || "Someone"} commented on your post.`,
                    });
                  }

                  conn.commit((commitErr) => {
                    conn.release();

                    if (commitErr)
                      return res
                        .status(500)
                        .json({ success: false, message: commitErr.message });

                    return res.status(201).json({
                      success: true,
                      comment_id: result.insertId,
                      partner_name: partner_name,
                    });
                  });
                },
              );
            },
          );
        },
      );
    });
  });
};

// ═════════════════════════════════════════════════════════════
//  STORIES
// ═════════════════════════════════════════════════════════════

// GET /api/feed/stories?user_id=1411&user_role=Sales%20Person
export const getStories = (req, res) => {
  let actor;
  try {
    actor = getActor(req);
  } catch (e) {
    return res
      .status(e.status || 400)
      .json({ success: false, message: e.message });
  }

  query(
    `SELECT
       s.*,

       NOT EXISTS(
         SELECT 1 FROM feed_story_views v
         WHERE v.story_id = s.id AND v.viewer_id = ? AND v.viewer_role = ?
       ) AS is_unseen,

       CASE
         WHEN s.author_role = 'project_partner'
           THEN (SELECT fullname FROM projectpartner   WHERE id             = s.author_id)
         WHEN s.author_role = 'sales_partner'
           THEN (SELECT fullname FROM salespersons     WHERE salespersonsid = s.author_id)
         WHEN s.author_role = 'territory_partner'
           THEN (SELECT fullname FROM territorypartner WHERE id             = s.author_id)
         ELSE NULL
       END AS author_name,

       CASE
         WHEN s.author_role = 'project_partner'
           THEN (SELECT userimage FROM projectpartner   WHERE id             = s.author_id)
         WHEN s.author_role = 'sales_partner'
           THEN (SELECT userimage FROM salespersons     WHERE salespersonsid = s.author_id)
         WHEN s.author_role = 'territory_partner'
           THEN (SELECT userimage FROM territorypartner WHERE id             = s.author_id)
         ELSE NULL
       END AS author_image

     FROM feed_stories s
     WHERE s.is_deleted = 0 AND s.expires_at > NOW()
     ORDER BY s.author_id, s.created_at ASC`,
    [actor.id, actor.role],
    (err, rows) => {
      if (err)
        return res.status(500).json({ success: false, message: err.message });

      const grouped = {};
      rows.forEach((story) => {
        const key = `${story.author_role}_${story.author_id}`;
        if (!grouped[key]) {
          grouped[key] = {
            author_id: story.author_id,
            author_role: story.author_role,
            author_name: story.author_name || null, // ← from JOIN
            author_image: story.author_image || null, // ← from JOIN
            has_unseen: false,
            stories: [],
          };
        }
        grouped[key].stories.push(story);
        if (story.is_unseen) grouped[key].has_unseen = true;
      });

      const list = Object.values(grouped).sort((a, b) => {
        const aOwn =
          a.author_id === actor.id && a.author_role === actor.role ? -1 : 0;
        const bOwn =
          b.author_id === actor.id && b.author_role === actor.role ? -1 : 0;
        return aOwn - bOwn;
      });

      return res.json({ success: true, stories: list });
    },
  );
};

// POST /api/feed/stories
// Body: { user_id, user_role, media_url, media_type?, caption?, duration_sec?, bg_color?, thumbnail_url? }
export const createStory = (req, res) => {
  let actor;
  try {
    actor = getActor(req);
  } catch (e) {
    return res
      .status(e.status || 400)
      .json({ success: false, message: e.message });
  }

  const {
    media_url,
    media_type = "image",
    caption,
    duration_sec,
    bg_color = "#000000",
    sticker_data,
    thumbnail_url,
  } = req.body;

  if (!media_url) {
    return res
      .status(400)
      .json({ success: false, message: "media_url is required." });
  }

  const isVideo = media_type === "video";
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  query(
    `INSERT INTO feed_stories
       (author_id, author_role, media_url, media_type, duration_sec,
        thumbnail_url, caption, sticker_data, bg_color, expires_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      actor.id,
      actor.role,
      media_url,
      isVideo ? "video" : "image",
      parseInt(duration_sec) || (isVideo ? 15 : 5),
      thumbnail_url || null,
      caption || null,
      sticker_data || null,
      bg_color,
      expiresAt,
    ],
    (err, result) => {
      if (err)
        return res.status(500).json({ success: false, message: err.message });
      return res.status(201).json({ success: true, story_id: result.insertId });
    },
  );
};

// POST /api/feed/stories/:id/view
// Body: { user_id, user_role }
export const viewStory = (req, res) => {
  let actor;
  try {
    actor = getActor(req);
  } catch (e) {
    return res
      .status(e.status || 400)
      .json({ success: false, message: e.message });
  }

  const storyId = parseInt(req.params.id);

  query(
    "INSERT IGNORE INTO feed_story_views (story_id, viewer_id, viewer_role) VALUES (?,?,?)",
    [storyId, actor.id, actor.role],
    (err) => {
      if (err)
        return res.status(500).json({ success: false, message: err.message });
      query(
        "UPDATE feed_stories SET views_count = views_count + 1 WHERE id=?",
        [storyId],
        (err2) => {
          if (err2)
            return res
              .status(500)
              .json({ success: false, message: err2.message });
          return res.json({ success: true });
        },
      );
    },
  );
};

// GET /api/feed/stories/:id/views?user_id=1411&user_role=Sales%20Person
// GET /api/feed/stories/:id/views?user_id=1411&user_role=Sales%20Person
export const getStoryViewers = (req, res) => {
  let actor;
  try {
    actor = getActor(req);
  } catch (e) {
    return res
      .status(e.status || 400)
      .json({ success: false, message: e.message });
  }

  const storyId = parseInt(req.params.id);

  // Step 1: verify the story belongs to the actor
  query(
    "SELECT author_id, author_role FROM feed_stories WHERE id = ?",
    [storyId],
    (err, rows) => {
      if (err)
        return res.status(500).json({ success: false, message: err.message });

      const story = rows[0];
      if (
        !story ||
        story.author_id !== actor.id ||
        story.author_role !== actor.role
      ) {
        return res
          .status(403)
          .json({ success: false, message: "Not your story." });
      }

      query(
        `SELECT
           fsv.viewer_id,
           fsv.viewer_role,
           fsv.viewed_at,

           CASE fsv.viewer_role
             WHEN 'project_partner'
               THEN (SELECT username  FROM projectpartner   WHERE id             = fsv.viewer_id)
             WHEN 'sales_partner'
               THEN (SELECT username  FROM salespersons     WHERE salespersonsid = fsv.viewer_id)
             WHEN 'territory_partner'
               THEN (SELECT username  FROM territorypartner WHERE id             = fsv.viewer_id)
             ELSE NULL
           END AS full_name,

           CASE fsv.viewer_role
             WHEN 'project_partner'
               THEN (SELECT userimage FROM projectpartner   WHERE id             = fsv.viewer_id)
             WHEN 'sales_partner'
               THEN (SELECT userimage FROM salespersons     WHERE salespersonsid = fsv.viewer_id)
             WHEN 'territory_partner'
               THEN (SELECT userimage FROM territorypartner WHERE id             = fsv.viewer_id)
             ELSE NULL
           END AS image

         FROM feed_story_views fsv
         WHERE fsv.story_id = ?
         ORDER BY fsv.viewed_at DESC`,
        [storyId],
        (err2, viewers) => {
          if (err2)
            return res
              .status(500)
              .json({ success: false, message: err2.message });

          return res.json({ success: true, viewers });
        },
      );
    },
  );
};

// POST /api/feed/stories/:id/reply
// Body: { user_id, user_role, message }
export const replyToStory = (req, res) => {
  let actor;
  try {
    actor = getActor(req);
  } catch (e) {
    return res
      .status(e.status || 400)
      .json({ success: false, message: e.message });
  }

  const storyId = parseInt(req.params.id);
  const { message } = req.body;

  if (!message?.trim()) {
    return res
      .status(400)
      .json({ success: false, message: "Message cannot be empty." });
  }

  db.getConnection((connErr, conn) => {
    if (connErr)
      return res.status(500).json({ success: false, message: connErr.message });

    conn.beginTransaction((txErr) => {
      if (txErr) {
        conn.release();
        return res.status(500).json({ success: false, message: txErr.message });
      }

      const rollback = (err) =>
        conn.rollback(() => {
          conn.release();
          res.status(500).json({ success: false, message: err.message });
        });

      conn.query(
        "INSERT INTO feed_story_replies (story_id, sender_id, sender_role, message) VALUES (?,?,?,?)",
        [storyId, actor.id, actor.role, message.trim()],
        (insErr) => {
          if (insErr) return rollback(insErr);
          conn.query(
            "SELECT author_id, author_role FROM feed_stories WHERE id=?",
            [storyId],
            (selErr, storyRows) => {
              if (selErr) return rollback(selErr);
              const story = storyRows[0];
              if (story && story.author_id !== actor.id) {
                notify(conn, {
                  recipientId: story.author_id,
                  recipientRole: story.author_role,
                  actorId: actor.id,
                  actorRole: actor.role,
                  type: "story_reply",
                  referenceId: storyId,
                  referenceType: "story",
                  message: "replied to your story.",
                });
              }
              conn.commit((commitErr) => {
                conn.release();
                if (commitErr)
                  return res
                    .status(500)
                    .json({ success: false, message: commitErr.message });
                return res.status(201).json({ success: true });
              });
            },
          );
        },
      );
    });
  });
};

// DELETE /api/feed/stories/:id
// Body: { user_id, user_role }
export const deleteStory = (req, res) => {
  let actor;
  try {
    actor = getActor(req);
  } catch (e) {
    return res
      .status(e.status || 400)
      .json({ success: false, message: e.message });
  }

  const storyId = parseInt(req.params.id);

  query(
    "SELECT author_id, author_role FROM feed_stories WHERE id=? AND is_deleted=0",
    [storyId],
    (err, rows) => {
      if (err)
        return res.status(500).json({ success: false, message: err.message });
      if (!rows.length)
        return res
          .status(404)
          .json({ success: false, message: "Story not found." });

      const story = rows[0];
      if (story.author_id !== actor.id || story.author_role !== actor.role) {
        return res
          .status(403)
          .json({ success: false, message: "Not your story." });
      }

      query(
        "UPDATE feed_stories SET is_deleted=1 WHERE id=?",
        [storyId],
        (err2) => {
          if (err2)
            return res
              .status(500)
              .json({ success: false, message: err2.message });
          return res.json({ success: true });
        },
      );
    },
  );
};

// ═════════════════════════════════════════════════════════════
//  FOLLOW / UNFOLLOW
// ═════════════════════════════════════════════════════════════

// POST /api/feed/follow
// Body: { user_id, user_role, target_id, target_role }
export const toggleFollow = (req, res) => {
  let actor;
  try {
    actor = getActor(req);
  } catch (e) {
    return res
      .status(e.status || 400)
      .json({ success: false, message: e.message });
  }

  const { target_id, target_role } = req.body;
  const tRole = normaliseRole(target_role);

  if (!tRole)
    return res
      .status(400)
      .json({ success: false, message: "Invalid target_role." });
  if (parseInt(target_id) === actor.id && tRole === actor.role) {
    return res
      .status(400)
      .json({ success: false, message: "Cannot follow yourself." });
  }

  query(
    `SELECT id FROM feed_follows WHERE follower_id=? AND follower_role=? AND following_id=? AND following_role=?`,
    [actor.id, actor.role, target_id, tRole],
    (err, rows) => {
      if (err)
        return res.status(500).json({ success: false, message: err.message });

      if (rows.length) {
        query(
          `DELETE FROM feed_follows WHERE follower_id=? AND follower_role=? AND following_id=? AND following_role=?`,
          [actor.id, actor.role, target_id, tRole],
          (delErr) => {
            if (delErr)
              return res
                .status(500)
                .json({ success: false, message: delErr.message });
            return res.json({ success: true, following: false });
          },
        );
      } else {
        query(
          `INSERT INTO feed_follows (follower_id, follower_role, following_id, following_role) VALUES (?,?,?,?)`,
          [actor.id, actor.role, target_id, tRole],
          (insErr) => {
            if (insErr)
              return res
                .status(500)
                .json({ success: false, message: insErr.message });
            return res.json({ success: true, following: true });
          },
        );
      }
    },
  );
};

// ═════════════════════════════════════════════════════════════
//  NOTIFICATIONS
// ═════════════════════════════════════════════════════════════

// GET /api/feed/notifications?user_id=1411&user_role=Sales%20Person&page=1
export const getNotifications = (req, res) => {
  let actor;
  try {
    actor = getActor(req);
  } catch (e) {
    return res
      .status(e.status || 400)
      .json({ success: false, message: e.message });
  }

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = 20;
  const offset = (page - 1) * limit;

  query(
    `SELECT * FROM feed_notifications WHERE recipient_id=? AND recipient_role=? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [actor.id, actor.role, limit, offset],
    (err, rows) => {
      if (err)
        return res.status(500).json({ success: false, message: err.message });

      query(
        `UPDATE feed_notifications SET is_read=1 WHERE recipient_id=? AND recipient_role=? AND is_read=0`,
        [actor.id, actor.role],
        () => {},
      );

      return res.json({ success: true, notifications: rows });
    },
  );
};

// GET /api/feed/notifications/unread-count?user_id=1411&user_role=Sales%20Person
export const getUnreadCount = (req, res) => {
  let actor;
  try {
    actor = getActor(req);
  } catch (e) {
    return res
      .status(e.status || 400)
      .json({ success: false, message: e.message });
  }

  query(
    `SELECT COUNT(*) AS cnt FROM feed_notifications WHERE recipient_id=? AND recipient_role=? AND is_read=0`,
    [actor.id, actor.role],
    (err, rows) => {
      if (err)
        return res.status(500).json({ success: false, message: err.message });
      return res.json({ success: true, count: rows[0].cnt });
    },
  );
};

// ─────────────────────────────────────────────────────────────
//  Add to feedController.js
//
//  GET /api/feed/follow/counts?user_id=1411&user_role=Sales%20Person
//  Returns: { followers: N, following: N }
// ─────────────────────────────────────────────────────────────

export const getFollowCounts = (req, res) => {
  let actor;
  try {
    actor = getActor(req);
  } catch (e) {
    return res
      .status(e.status || 400)
      .json({ success: false, message: e.message });
  }

  // Run both counts in parallel
  const countFollowers = new Promise((resolve, reject) => {
    query(
      `SELECT COUNT(*) AS cnt FROM feed_follows
       WHERE following_id = ? AND following_role = ?`,
      [actor.id, actor.role],
      (err, rows) => (err ? reject(err) : resolve(rows[0].cnt)),
    );
  });

  const countFollowing = new Promise((resolve, reject) => {
    query(
      `SELECT COUNT(*) AS cnt FROM feed_follows
       WHERE follower_id = ? AND follower_role = ?`,
      [actor.id, actor.role],
      (err, rows) => (err ? reject(err) : resolve(rows[0].cnt)),
    );
  });

  Promise.all([countFollowers, countFollowing])
    .then(([followers, following]) => {
      res.json({ success: true, followers, following });
    })
    .catch((err) => {
      res.status(500).json({ success: false, message: err.message });
    });
};

// ─────────────────────────────────────────────────────────────
//  Add to feedRoutes.js  (before router.post("/follow", ...))
//  ⚠️  Must be BEFORE "/follow" so Express doesn't match "counts" as a postId
// ─────────────────────────────────────────────────────────────
