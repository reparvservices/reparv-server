import db from "../../config/dbconnect.js";
import moment from "moment-timezone";


// **Fetch All **
export const getAll = (req, res) => {
  const sql = "SELECT * FROM states ORDER BY state";
  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res.json(result);
  });
};

