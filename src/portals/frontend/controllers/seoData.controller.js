import db from "#db";

// **Fetch All **
export const getAll = (req, res) => {
  const sql = "SELECT * FROM seo_pages ORDER BY id DESC";
  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res.json(result);
  });
};

// **Fetch By Page **
export const getByPage = (req, res) => {
  const page = req.params.page;
  const sql = "SELECT * FROM seo_pages WHERE page = ?";
  db.query(sql, [page], (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res.json(result[0]);
  });
};
