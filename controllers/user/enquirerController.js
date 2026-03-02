import db from "../../config/dbconnect.js";
import moment from "moment-timezone";
import { sanitize } from "../../utils/sanitize.js";

// Fetch All Enquiries for Guest User Properties
export const getAll = (req, res) => {
  const userId = req.guestUser?.id;

  if (!userId) {
    return res
      .status(401)
      .json({ message: "Unauthorized Access, Please Login Again!" });
  }

  const sql = `
    SELECT 
      e.*,
      p.frontView,
      p.propertyName,
      p.seoSlug,
      p.commissionAmount,
      tp.fullname AS territoryName,
      tp.contact AS territoryContact
    FROM enquirers e
    INNER JOIN properties p 
      ON e.propertyid = p.propertyid
    LEFT JOIN territorypartner tp 
      ON tp.id = e.territorypartnerid
    WHERE 
      p.guestUserId = ?
      AND e.status != 'Token'
    ORDER BY e.enquirersid DESC
  `;

  db.query(sql, [userId], (err, result) => {
    if (err) {
      console.error("Error fetching Enquirers:", err);
      return res.status(500).json({
        message: "Database error",
        error: err,
      });
    }

    const formatted = result.map((row) => ({
      ...row,
      created_at: moment.utc(row.created_at).tz("Asia/Kolkata").format("DD MMM YYYY | hh:mm A"),
      updated_at: moment.utc(row.updated_at).tz("Asia/Kolkata").format("DD MMM YYYY | hh:mm A"),
    }));

    res.json(formatted);
  });
};