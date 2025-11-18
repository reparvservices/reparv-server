import db from "../../config/dbconnect.js";

// **Fetch All **
export const getAllActive = (req, res) => {
  const sql =
    "SELECT * FROM sliders WHERE status = 'Active' AND projectpartnerid IS NULL ORDER BY id DESC";
  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res.json(result);
  });
};

// **Fetch All **
export const getForMobile = (req, res) => {
  const sql =
    "SELECT * FROM sliders WHERE projectpartnerid IS NULL AND mobileimage IS NOT NULL LIMIT 1";
  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res.json(result[0]);
  });
};
