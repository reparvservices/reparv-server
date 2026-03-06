import db from "../../config/dbconnect.js";
import moment from "moment-timezone";

// **Fetch All**
export const getAll = (req, res) => {
  const sql = `
    SELECT 
      n.*,

      /* Likes (distinct users) */
      COALESCE(l.likes, 0) AS likes,

      /* Views & Shares */
      COALESCE(na.views, 0) AS views,
      COALESCE(na.shares, 0) AS shares

    FROM news n

    /* Likes */
    LEFT JOIN (
      SELECT 
        news_id,
        COUNT(DISTINCT guest_user_id) AS likes
      FROM user_news_wishlist
      GROUP BY news_id
    ) l
      ON l.news_id = n.id

    /* News Analyst */
    LEFT JOIN news_analyst na
      ON na.news_id = n.id

    WHERE n.status = 'Active'
    ORDER BY n.id DESC
  `;

  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    const formatted = result.map((row) => ({
      ...row,
      likes: Number(row.likes) || 0,
      views: Number(row.views) || 0,
      shares: Number(row.shares) || 0,
      created_at: moment
        .utc(row.created_at)
        .tz("Asia/Kolkata")
        .format("DD MMM YYYY | hh:mm A"),
      updated_at: moment
        .utc(row.updated_at)
        .tz("Asia/Kolkata")
        .format("DD MMM YYYY | hh:mm A"),
    }));

    res.json(formatted);
  });
};

export const getById = (req, res) => {
  const seoSlug = req.params.slug;

  const sql = `
    SELECT 
      n.*,

      /* Likes (distinct users) */
      COALESCE(likesData.likes, 0) AS likes,

      /* Views & Shares */
      COALESCE(na.views, 0) AS views,
      COALESCE(na.shares, 0) AS shares

    FROM news n

    /* Likes */
    LEFT JOIN (
      SELECT 
        news_id,
        COUNT(DISTINCT guest_user_id) AS likes
      FROM user_news_wishlist
      GROUP BY news_id
    ) likesData
      ON likesData.news_id = n.id

    /* News Analyst */
    LEFT JOIN news_analyst na
      ON na.news_id = n.id

    WHERE n.seoSlug = ?
    LIMIT 1
  `;

  db.query(sql, [seoSlug], (err, result) => {
    if (err) {
      console.error("Error fetching news:", err);
      return res.status(500).json({ message: "Database error" });
    }

    if (!result.length) {
      return res.status(404).json({ message: "News not found" });
    }

    const row = result[0];

    res.json({
      ...row,
      likes: Number(row.likes) || 0,
      views: Number(row.views) || 0,
      shares: Number(row.shares) || 0,
      created_at: moment
        .utc(row.created_at)
        .tz("Asia/Kolkata")
        .format("DD MMM YYYY | hh:mm A"),
      updated_at: moment
        .utc(row.updated_at)
        .tz("Asia/Kolkata")
        .format("DD MMM YYYY | hh:mm A"),
    });
  });
};
