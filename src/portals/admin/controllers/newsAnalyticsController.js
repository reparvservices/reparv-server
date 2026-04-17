import db from "#db";

// ADD NEWS VISITOR (view / share)
export const addNewsVisitor = (req, res) => {
  const { news_id, source = "view" } = req.body;

  if (!news_id) {
    return res.status(400).json({ message: "news_id is required" });
  }

  const validSources = ["view", "share"];
  if (!validSources.includes(source)) {
    return res.status(400).json({ message: "Invalid source type" });
  }

  const isView = source === "view" ? 1 : 0;
  const isShare = source === "share" ? 1 : 0;

  // 1️⃣ Check news exists
  db.query(
    `SELECT id FROM news WHERE id = ?`,
    [news_id],
    (err, newsResult) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: "DB error" });
      }

      if (newsResult.length === 0) {
        return res.status(404).json({ message: "News does not exist" });
      }

      // 2️⃣ Check analytics row
      db.query(
        `SELECT id FROM news_analyst WHERE news_id = ?`,
        [news_id],
        (err2, result) => {
          if (err2) {
            console.error(err2);
            return res.status(500).json({ message: "DB error" });
          }

          if (result.length > 0) {
            // 🔄 UPDATE
            const updateSql = `
              UPDATE news_analyst
              SET
                views = views + ?,
                shares = shares + ?
              WHERE news_id = ?
            `;

            db.query(updateSql, [isView, isShare, news_id], (err3) => {
              if (err3) {
                console.error(err3);
                return res.status(500).json({ message: "DB error" });
              }

              res.json({
                message: "News analytics updated",
                news_id,
                source,
              });
            });
          } else {
            // ➕ INSERT (first entry)
            const insertSql = `
              INSERT INTO news_analyst (news_id, views, shares)
              VALUES (?, ?, ?)
            `;

            db.query(insertSql, [news_id, isView, isShare], (err4) => {
              if (err4) {
                console.error(err4);
                return res.status(500).json({ message: "DB error" });
              }

              res.json({
                message: "News analytics created",
                news_id,
                source,
              });
            });
          }
        }
      );
    }
  );
};

// GET TOTAL NEWS VISITORS
export const getTotalNewsVisitors = (req, res) => {
  const { news_id } = req.query;

  if (!news_id) {
    return res.status(400).json({ message: "news_id is required" });
  }

  const sql = `
    SELECT 
      n.id AS news_id,
      COALESCE(na.views, 0) AS views,
      COALESCE(na.shares, 0) AS shares
    FROM news n
    LEFT JOIN news_analyst na ON na.news_id = n.id
    WHERE n.id = ?
  `;

  db.query(sql, [news_id], (err, result) => {
    if (err) {
      console.error("News analytics error:", err);
      return res.status(500).json({ message: "DB error" });
    }

    if (result.length === 0) {
      return res.status(404).json({ message: "News does not exist" });
    }

    res.json({
      news_id: result[0].news_id,
      totalVisitors: result[0].views,
      shares: result[0].shares,
    });
  });
};