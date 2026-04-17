import db from "#db";
import moment from "moment-timezone";
import bcrypt from "bcryptjs";

export const getAllProperty = (req, res) => {
 try {

   const Id = req.user?.id; 

  let sql = `SELECT * FROM properties WHERE status='Active' AND approve='Approved' AND builderid=?`;

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res.json(result);
  });

 } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Internal server error", error });
 }
}