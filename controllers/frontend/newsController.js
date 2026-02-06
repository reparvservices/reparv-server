import db from "../../config/dbconnect.js";
import moment from "moment";

// **Fetch All**
export const getAll = (req, res) => {
  const sql = "SELECT * FROM news WHERE status='Active' ORDER BY id DESC";
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

// **Fetch Single news by SEO Slug with Analytics**
export const getById = (req, res) => {
  const seoSlug = req.params.slug;

  const sql = `
    SELECT * 
    FROM news
    WHERE seoSlug = ?
    LIMIT 1
  `;

  db.query(sql, [seoSlug], (err, result) => {
    if (err) {
      console.error("Error fetching news:", err);
      return res.status(500).json({ message: "Database error" });
    }

    if (!result || result.length === 0) {
      return res.status(404).json({ message: "News not found" });
    }

    const row = result[0];

    res.json({
      ...row,
      created_at: moment(row.created_at).format("DD MMM YYYY | hh:mm A"),
      updated_at: moment(row.updated_at).format("DD MMM YYYY | hh:mm A"),
    });
  });
};


