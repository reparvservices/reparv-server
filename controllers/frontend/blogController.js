import db from "../../config/dbconnect.js";
import moment from "moment";

// **Fetch All**
export const getAll = (req, res) => {
  const sql = "SELECT * FROM blogs WHERE status='Active' ORDER BY id DESC";
  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    const formatted = result.map((row) => ({
      ...row,
      created_at: moment(row.created_at).format("DD MMM YYYY | hh:mm A"),
      updated_at: moment(row.updated_at).format("DD MMM YYYY | hh:mm A"),
    }));

    res.json(formatted);
  });
};

// **Fetch Single Blog by SEO Slug with Analytics**
export const getById = (req, res) => {
  const seoSlug = req.params.slug;

  const sql = `
    SELECT 
      b.*,

      /* Likes (distinct users) */
      COALESCE(likesData.likes, 0) AS likes,

      /* Views & Shares (counters) */
      COALESCE(ba.views, 0) AS views,
      COALESCE(ba.shares, 0) AS shares

    FROM blogs b

    /* Likes */
    LEFT JOIN (
      SELECT 
        blog_id,
        COUNT(DISTINCT guest_user_id) AS likes
      FROM user_blog_wishlist
      GROUP BY blog_id
    ) likesData
      ON likesData.blog_id = b.id

    /* Blog Analyst */
    LEFT JOIN blog_analyst ba
      ON ba.blog_id = b.id

    WHERE b.seoSlug = ?
    LIMIT 1
  `;

  db.query(sql, [seoSlug], (err, result) => {
    if (err) {
      console.error("Error fetching blog:", err);
      return res.status(500).json({ message: "Database error" });
    }

    if (!result.length) {
      return res.status(404).json({ message: "Blog not found" });
    }

    const row = result[0];

    res.json({
      ...row,
      likes: Number(row.likes) || 0,
      views: Number(row.views) || 0,
      shares: Number(row.shares) || 0,
      created_at: moment(row.created_at).format("DD MMM YYYY | hh:mm A"),
      updated_at: moment(row.updated_at).format("DD MMM YYYY | hh:mm A"),
    });
  });
};

// **Add New **
export const addFeedback = (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const { feedbackType, fullname, contact, email, message } = req.body;

  if (!feedbackType || !fullname || !contact || !email || !message) {
    return res.status(400).json({ message: "All Fields are Required" });
  }

  const sql = `INSERT INTO blogfeedback (type, fullname, contact, email, message, created_at, updated_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?)`;

  db.query(
    sql,
    [feedbackType, fullname, contact, email, message, currentdate, currentdate],
    (err, result) => {
      if (err) {
        console.error("Error inserting Feedback:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      return res.status(201).json({
        message: "Feedback added successfully",
      });
    }
  );
};
