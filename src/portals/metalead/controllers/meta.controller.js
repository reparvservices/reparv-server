import db from "#db";
import moment from "moment-timezone";

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
        ? moment.utc(row.created_at).tz("Asia/Kolkata").format("DD MMM YYYY | hh:mm A")
        : null,
      updated_at: row.updated_at
        ? moment.utc(row.updated_at).tz("Asia/Kolkata").format("DD MMM YYYY | hh:mm A")
        : null,
    }));

    res.json({
      success: true,
      data: formatted,
    });
  });
};

export const deleteLead = (req, res) => {
  const id = parseInt(req.params.id);

  if (!id) {
    return res.status(400).json({
      success: false,
      message: "Lead ID is required",
    });
  }

  // Check if lead exists
  const checkQuery = "SELECT id FROM meta_leads WHERE id = ?";

  db.query(checkQuery, [id], (err, result) => {
    if (err) {
      console.error("Error checking lead:", err);
      return res.status(500).json({
        success: false,
        message: "Database error",
      });
    }

    if (result.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Lead not found",
      });
    }

    // Delete lead
    const deleteQuery = "DELETE FROM meta_leads WHERE id = ?";

    db.query(deleteQuery, [id], (err2) => {
      if (err2) {
        console.error("Error deleting lead:", err2);
        return res.status(500).json({
          success: false,
          message: "Failed to delete lead",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Lead deleted successfully",
      });
    });
  });
};
