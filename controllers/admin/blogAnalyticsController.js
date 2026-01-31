import db from "../../config/dbconnect.js";

// ADD BLOG VISITOR (view / share)
export const addBlogVisitor = (req, res) => {
  const { blog_id, source = "view" } = req.body;

  if (!blog_id) {
    return res.status(400).json({ message: "blog_id is required" });
  }

  const validSources = ["view", "share"];
  if (!validSources.includes(source)) {
    return res.status(400).json({ message: "Invalid source type" });
  }

  const isView = source === "view" ? 1 : 0;
  const isShare = source === "share" ? 1 : 0;

  // 1 Check blog exists
  db.query(
    `SELECT id FROM blogs WHERE id = ?`,
    [blog_id],
    (err, blogResult) => {
      if (err) return res.status(500).json({ message: "DB error" });

      if (blogResult.length === 0) {
        return res.status(404).json({ message: "Blog does not exist" });
      }

      // 2 Check analytics row
      db.query(
        `SELECT id FROM blog_analyst WHERE blog_id = ?`,
        [blog_id],
        (err2, result) => {
          if (err2) return res.status(500).json({ message: "DB error" });

          if (result.length > 0) {
            // UPDATE
            const updateSql = `
              UPDATE blog_analyst
              SET
                views = views + ?,
                shares = shares + ?
              WHERE blog_id = ?
            `;

            db.query(updateSql, [isView, isShare, blog_id], (err3) => {
              if (err3) return res.status(500).json({ message: "DB error" });

              res.json({
                message: "Blog analytics updated",
                blog_id,
                source,
              });
            });
          } else {
            // INSERT (first time only)
            const insertSql = `
              INSERT INTO blog_analyst (blog_id, views, shares)
              VALUES (?, ?, ?)
            `;

            db.query(insertSql, [blog_id, isView, isShare], (err4) => {
              if (err4) return res.status(500).json({ message: "DB error" });

              res.json({
                message: "Blog analytics created",
                blog_id,
                source,
              });
            });
          }
        }
      );
    }
  );
};

export const getTotalBlogVisitors = (req, res) => {
  const { blog_id } = req.query;

  if (!blog_id) {
    return res.status(400).json({ message: "blog_id is required" });
  }

  const sql = `
    SELECT 
      b.id AS blog_id,

      COALESCE(ba.views, 0) AS views,
      COALESCE(ba.shares, 0) AS shares

    FROM blogs b
    LEFT JOIN blog_analyst ba
      ON ba.blog_id = b.id
    WHERE b.id = ?
  `;

  db.query(sql, [blog_id], (err, result) => {
    if (err) {
      console.error("Blog analytics error:", err);
      return res.status(500).json({ message: "DB error" });
    }

    if (result.length === 0) {
      return res.status(404).json({ message: "Blog does not exist" });
    }

    res.json({
      blog_id: result[0].blog_id,
      totalVisitors: result[0].views,
      shares: result[0].shares,
    });
  });
};
