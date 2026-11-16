import db from "#db";
import {
  clampLimit,
  clampPage,
  formatPublicComment,
  formatPublicPost,
} from "../utils/feedFormat.js";

// Read-only feed for the customer app. Customers cannot post, like or comment (yet), and the
// partner feed's `user_id` in the request body is not an identity we trust, so this exposes only
// posts the author made visible to everyone.

const AUTHOR_NAME = `CASE
  WHEN p.author_role = 'project_partner'   THEN (SELECT fullname FROM projectpartner   WHERE id = p.author_id)
  WHEN p.author_role = 'sales_partner'     THEN (SELECT fullname FROM salespersons     WHERE salespersonsid = p.author_id)
  WHEN p.author_role = 'territory_partner' THEN (SELECT fullname FROM territorypartner WHERE id = p.author_id)
END`;

const AUTHOR_IMAGE = `CASE
  WHEN p.author_role = 'project_partner'   THEN (SELECT userimage FROM projectpartner   WHERE id = p.author_id)
  WHEN p.author_role = 'sales_partner'     THEN (SELECT userimage FROM salespersons     WHERE salespersonsid = p.author_id)
  WHEN p.author_role = 'territory_partner' THEN (SELECT userimage FROM territorypartner WHERE id = p.author_id)
END`;

// GET /customerapp/feed/posts?page=1&limit=20
export const getPublicFeed = (req, res) => {
  const page = clampPage(req.query.page);
  const limit = clampLimit(req.query.limit);
  const offset = (page - 1) * limit;

  // Fetch one extra row so the client knows whether another page exists without a COUNT(*).
  db.query(
    `SELECT p.*, ${AUTHOR_NAME} AS author_name, ${AUTHOR_IMAGE} AS author_image
       FROM feed_posts p
      WHERE p.is_deleted = 0 AND p.visibility = 'all'
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT ? OFFSET ?`,
    [limit + 1, offset],
    (err, rows) => {
      if (err) {
        console.error("[customer feed] posts:", err.message);
        return res.status(500).json({ success: false, message: "Could not load the feed." });
      }
      const hasMore = rows.length > limit;
      return res.json({
        success: true,
        page,
        limit,
        hasMore,
        posts: rows.slice(0, limit).map(formatPublicPost),
      });
    },
  );
};

// GET /customerapp/feed/posts/:id/comments
export const getPublicComments = (req, res) => {
  const postId = parseInt(req.params.id, 10);
  if (!postId) {
    return res.status(400).json({ success: false, message: "Invalid post id." });
  }
  const page = clampPage(req.query.page);
  const limit = clampLimit(req.query.limit, 20, 50);

  // The post itself must be public, otherwise comments on a partners-only post would leak.
  db.query(
    `SELECT c.id, c.content, c.created_at, c.partner_name,
            ${AUTHOR_NAME.replaceAll("p.", "c.")} AS author_name,
            ${AUTHOR_IMAGE.replaceAll("p.", "c.")} AS author_image
       FROM feed_post_comments c
       JOIN feed_posts p ON p.id = c.post_id
      WHERE c.post_id = ? AND c.parent_id IS NULL AND c.is_deleted = 0
        AND p.is_deleted = 0 AND p.visibility = 'all'
      ORDER BY c.created_at ASC
      LIMIT ? OFFSET ?`,
    [postId, limit, (page - 1) * limit],
    (err, rows) => {
      if (err) {
        console.error("[customer feed] comments:", err.message);
        return res.status(500).json({ success: false, message: "Could not load comments." });
      }
      return res.json({ success: true, page, comments: rows.map(formatPublicComment) });
    },
  );
};

// ── Actions (login required, see requireCustomer) ────────────────────────────────────────────
import dbPromise from "#db/promise";

export const MAX_COMMENT_LENGTH = 500;

async function inTransaction(work) {
  const conn = await dbPromise.getConnection();
  try {
    await conn.beginTransaction();
    const out = await work(conn);
    await conn.commit();
    return out;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

// Returns the post's author (so the partner can be notified), or null if the post is not public.
const publicPostExists = async (conn, postId) => {
  const [rows] = await conn.query(
    "SELECT id, author_id, author_role FROM feed_posts WHERE id = ? AND is_deleted = 0 AND visibility = 'all' FOR UPDATE",
    [postId],
  );
  return rows[0] || null;
};

const notifyAuthor = (conn, post, customerId, type, message) =>
  conn.query(
    `INSERT INTO feed_notifications
       (recipient_id, recipient_role, actor_id, actor_role, type, reference_id, reference_type, message)
     VALUES (?, ?, ?, 'customer', ?, ?, 'post', ?)`,
    [post.author_id, post.author_role, customerId, type, post.id, message],
  );

// POST /customerapp/feed/posts/:id/like  → toggles; returns { liked, likes_count }
export const toggleCustomerLike = async (req, res) => {
  const postId = parseInt(req.params.id, 10);
  if (!postId) return res.status(400).json({ success: false, message: "Invalid post id." });
  try {
    const result = await inTransaction(async (conn) => {
      const post = await publicPostExists(conn, postId);
      if (!post) return null;
      const [del] = await conn.query(
        "DELETE FROM feed_post_likes WHERE post_id = ? AND user_id = ? AND user_role = 'customer'",
        [postId, req.customer.id],
      );
      let liked = false;
      if (del.affectedRows) {
        await conn.query("UPDATE feed_posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = ?", [postId]);
      } else {
        await conn.query("INSERT INTO feed_post_likes (post_id, user_id, user_role) VALUES (?, ?, 'customer')", [
          postId,
          req.customer.id,
        ]);
        await conn.query("UPDATE feed_posts SET likes_count = likes_count + 1 WHERE id = ?", [postId]);
        liked = true;
        await notifyAuthor(conn, post, req.customer.id, "like", "liked your post.");
      }
      const [[row]] = await conn.query("SELECT likes_count FROM feed_posts WHERE id = ?", [postId]);
      return { liked, likes_count: row.likes_count };
    });
    if (!result) return res.status(404).json({ success: false, message: "Post not found." });
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error("[customer feed] like:", err.message);
    return res.status(500).json({ success: false, message: "Could not update like." });
  }
};

// POST /customerapp/feed/posts/:id/comments  { content }
export const addCustomerComment = async (req, res) => {
  const postId = parseInt(req.params.id, 10);
  const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
  if (!postId) return res.status(400).json({ success: false, message: "Invalid post id." });
  if (!content) return res.status(400).json({ success: false, message: "Comment cannot be empty." });
  if (content.length > MAX_COMMENT_LENGTH) {
    return res.status(400).json({ success: false, message: `Comment is too long (max ${MAX_COMMENT_LENGTH}).` });
  }
  try {
    const result = await inTransaction(async (conn) => {
      const post = await publicPostExists(conn, postId);
      if (!post) return null;
      const name = (req.customer.fullname || "").trim() || "Customer";
      const [ins] = await conn.query(
        "INSERT INTO feed_post_comments (post_id, parent_id, author_id, author_role, partner_name, content) VALUES (?, NULL, ?, 'customer', ?, ?)",
        [postId, req.customer.id, name.slice(0, 150), content],
      );
      await conn.query("UPDATE feed_posts SET comments_count = comments_count + 1 WHERE id = ?", [postId]);
      await notifyAuthor(conn, post, req.customer.id, "comment", "commented on your post.");
      const [[row]] = await conn.query("SELECT comments_count FROM feed_posts WHERE id = ?", [postId]);
      return {
        comments_count: row.comments_count,
        comment: formatPublicComment({
          id: ins.insertId,
          content,
          created_at: new Date().toISOString(),
          partner_name: name,
        }),
      };
    });
    if (!result) return res.status(404).json({ success: false, message: "Post not found." });
    return res.status(201).json({ success: true, ...result });
  } catch (err) {
    console.error("[customer feed] comment:", err.message);
    return res.status(500).json({ success: false, message: "Could not post comment." });
  }
};

// GET /customerapp/feed/posts/liked?ids=1,2,3 → which of these posts this customer liked
export const getLikedPostIds = async (req, res) => {
  const ids = String(req.query.ids || "")
    .split(",")
    .map((n) => parseInt(n, 10))
    .filter(Boolean)
    .slice(0, 50);
  if (!ids.length) return res.json({ success: true, liked: [] });
  try {
    const [rows] = await dbPromise.query(
      "SELECT post_id FROM feed_post_likes WHERE user_id = ? AND user_role = 'customer' AND post_id IN (?)",
      [req.customer.id, ids],
    );
    return res.json({ success: true, liked: rows.map((r) => r.post_id) });
  } catch (err) {
    console.error("[customer feed] liked:", err.message);
    return res.status(500).json({ success: false, message: "Could not load likes." });
  }
};
