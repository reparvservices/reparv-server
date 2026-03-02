import db from "../../config/dbconnect.js";
import moment from "moment-timezone";

export const getCount = (req, res) => {
  const query = `
    SELECT
      -- Self Earning = Half of Reparv Commission where partnerid = req.user.id
      (SELECT IFNULL(SUM(pf.reparvcommission) / 2, 0)
       FROM propertyfollowup pf
       JOIN enquirers e ON pf.enquirerid = e.enquirersid
       JOIN properties p ON e.propertyid = p.propertyid
       WHERE pf.status = 'Token' AND p.partnerid = ?) AS selfEarning,

      -- Total Deal In Square Feet
      (SELECT IFNULL(SUM(p.carpetArea), 0)
       FROM enquirers e
       JOIN properties p ON e.propertyid = p.propertyid
       WHERE e.status = 'Token' AND p.partnerid = ?) AS totalDealInSquareFeet,

      -- Total Properties of this Partner
      (SELECT COUNT(propertyid) FROM properties WHERE partnerid = ?) AS totalProperty,

      -- Total Tickets
      (SELECT COUNT(ticketid) 
       FROM tickets 
       INNER JOIN onboardingpartner op ON op.adharno = tickets.ticketadder 
       WHERE tickets.ticketadder = ?) AS totalTicket
  `;

  db.query(query, [req.onboardingUser?.id, req.onboardingUser?.id, req.onboardingUser?.id, req.onboardingUser?.adharId], (err, results) => {
    if (err) {
      console.error("Error fetching dashboard stats:", err);
      return res.status(500).json({ error: "Database error" });
    }
    //console.log(req.user);

    return res.json(results[0]);
  });
};

// **Get Partner Properties with Enquiry/Booking Status**
export const getProperties = (req, res) => {
  const partnerId = req.onboardingUser?.id;

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
    WHERE p.partnerid = ?
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
