import db from "#db";

export const getCount = (req, res) => {
  const userId = parseInt(req.builderUser?.id);
  if (!userId) {
    console.log("Invalid User Id: " + userId);
    return res.status(400).json({ message: "Invalid User Id" });
  }
  const adharId = parseInt(req.builderUser?.adharId);
  if (!adharId) {
    console.log("Invalid Aadhaar Id: " + adharId);
    return res.status(400).json({ message: "Invalid Aadhaar Id" });
  }
  const query = `
    SELECT
      (SELECT COUNT(propertyid) FROM properties WHERE builderid = ?) AS totalProperty,
      (SELECT COUNT(ticketid) FROM tickets WHERE ticketadder = ?) AS totalTicket,
      (SELECT COUNT(e.enquirersid) 
         FROM enquirers e 
         INNER JOIN properties p ON e.propertyid = p.propertyid 
         WHERE p.builderid = ? AND e.status = 'Token') AS totalCustomer
  `;

  db.query(query, [userId, adharId, userId], (err, results) => {
    if (err) {
      console.error("Error fetching dashboard stats:", err);
      return res.status(500).json({ error: "Database error" });
    }
    return res.json(results[0]); // single row
  });
};

// **Get Partner Properties with Enquiry/Booking Status**
export const getProperties = (req, res) => {
  const partnerId = req.builderUser?.id;

  if (!partnerId) {
    return res
      .status(401)
      .json({ message: "Unauthorized Access, Please Login Again!" });
  }

  const sql = `
    SELECT 
      p.*,
      builders.company_name,      
      COUNT(e.enquirersid) AS totalEnquiries,
      SUM(CASE WHEN e.status = 'Token' THEN 1 ELSE 0 END) AS bookedCount,
      SUM(CASE WHEN e.status != 'Token' THEN 1 ELSE 0 END) AS enquiryCount
    FROM properties p
    INNER JOIN builders ON p.builderid = builders.builderid
    LEFT JOIN enquirers e ON p.propertyid = e.propertyid
    WHERE p.builderid = ?
    GROUP BY p.propertyid
    ORDER BY p.created_at DESC;
  `;

  db.query(sql, [partnerId], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (result.length === 0) {
      return res.status(404).json({ message: "No properties found" });
    }

    // Format with status
    let formatted = result.map((row) => {
      let enquiryStatus = "None";
      if (row.bookedCount > 0) {
        enquiryStatus = "Booked";
      } else if (row.enquiryCount > 0) {
        enquiryStatus = "Enquired";
      }

      return {
        ...row,
        enquiryStatus,
      };
    });

    res.status(200).json(formatted);
  });
};