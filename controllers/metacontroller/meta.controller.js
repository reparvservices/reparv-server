import db from "../../config/dbconnect.js";
import moment from "moment";

/* =====================================================
   GET ALL LEADS
===================================================== */
export const getAllLeads = (req, res) => {
  const sql = `
    SELECT *
    FROM meta_leads
    ORDER BY created_time DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Error fetching leads:", err);
      return res.status(500).json({
        success: false,
        message: "Database error",
        error: err,
      });
    }

    const formatted = results.map((row) => ({
      ...row,
      created_time: row.created_time
        ? moment(row.created_time).format("DD MMM YYYY | hh:mm A")
        : null,
      created_at: row.created_at
        ? moment(row.created_at).format("DD MMM YYYY | hh:mm A")
        : null,
      updated_at: row.updated_at
        ? moment(row.updated_at).format("DD MMM YYYY | hh:mm A")
        : null,
    }));

    res.json({
      success: true,
      data: formatted,
    });
  });
};
