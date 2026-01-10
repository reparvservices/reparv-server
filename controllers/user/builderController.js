import db from "../../config/dbconnect.js";

// **Fetch All**
export const getAllActive = (req, res) => {
  const sql = "SELECT * FROM builders WHERE status = 'Active' AND company_name = 'Reparv' ORDER BY company_name";
  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res.json(result);
  });
};

