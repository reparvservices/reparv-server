import db from "../../config/dbconnect.js";
import moment from "moment-timezone";

export const getAll = (req, res) => {
  const promoterCity = req.promoterUser?.city;
  
  // Step 1: Validate user session
  if (!promoterCity) {
    return res.status(400).json({ message: "Please log in again!" });
  }

  // Step 2: Validate filter status
  const filterStatus = req.params.filterStatus;
  if (!filterStatus) {
    return res.status(401).json({ message: "Status not selected" });
  }

  // Step 3: Build query based on filter
  let sql = "";
  let queryParams = [];

  if (["New", "Eligible", "Not Eligible"].includes(filterStatus)) {
    sql = `SELECT * FROM loanemiforperson WHERE status = ? AND city = ? ORDER BY created_at DESC`;
    queryParams = [filterStatus, promoterCity];
  } else {
    sql = `SELECT * FROM loanemiforperson WHERE city = ? ORDER BY created_at DESC`;
    queryParams = [promoterCity];
  }

  // Step 4: Execute main data query
  db.query(sql, queryParams, (err, partners) => {
    if (err) {
      console.error("Error fetching EMI data:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    // Step 5: Execute count query
    const countQuery = `
      SELECT status, COUNT(*) AS count
      FROM loanemiforperson
      WHERE city = ?
      GROUP BY status
    `;

    db.query(countQuery, [promoterCity], (countErr, counts) => {
      if (countErr) {
        console.error("Error fetching EMI counts:", countErr);
        return res.status(500).json({ message: "Database error", error: countErr });
      }

      // Step 6: Format data
      const formatted = partners.map((row) => ({
        ...row,
        created_at: moment.utc(row.created_at).tz("Asia/Kolkata").format("DD MMM YYYY | hh:mm A"),
        updated_at: moment.utc(row.updated_at).tz("Asia/Kolkata").format("DD MMM YYYY | hh:mm A"),
        followUp: row.followUp || null,
        followUpDate: row.followUpDate
          ? moment(row.followUpDate).format("DD MMM YYYY | hh:mm A")
          : null,
      }));

      // Step 7: Convert counts to key-value object
      const statusCounts = counts.reduce((acc, curr) => {
        acc[curr.status] = curr.count;
        return acc;
      }, {});

      // Step 8: Send response
      return res.json({
        data: formatted,
        statusCounts,
      });
    });
  });
};