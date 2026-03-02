import db from "../../config/dbconnect.js";
import moment from "moment-timezone";

// **Fetch All**
export const getAll = (req, res) => {
  const sql =
    "SELECT * FROM properties WHERE  status='active' AND approve='Approved' ORDER BY propertyid DESC";
  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    console.log(result);

    res.json(result);
  });
};
