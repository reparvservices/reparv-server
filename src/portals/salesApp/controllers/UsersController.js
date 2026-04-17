import db from "#db";
import moment from "moment-timezone";

export const getAll = async (req, res) => {
  try {
    const sql = "SELECT * FROM salespersons";
    db.query(sql, (err, result) => {
      if (err) {
        console.error("Error fetching:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      res.json(result);
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message,
    });
  }
};

//asign login to sales partner
