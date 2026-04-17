import db from "#db";
import moment from "moment-timezone";

export const getCount = (req, res) => {
  const id = req.projectPartnerUser?.id;
  const email = req.projectPartnerUser?.email;

  const query = `
    SELECT
      IFNULL(SUM(CASE WHEN pf.status = 'Token' THEN pf.dealamount END), 0) AS totalDealAmount,

      IFNULL(SUM(CASE WHEN pf.status = 'Token' THEN pf.reparvcommission END) / 2, 0) AS selfEarning,

      COUNT(DISTINCT CASE WHEN e.status = 'Token' THEN e.enquirersid END) AS totalCustomer,

      COUNT(DISTINCT e.enquirersid) AS totalEnquirer,

      IFNULL(SUM(CASE WHEN e.status = 'Token' THEN p.carpetArea END), 0) AS totalDealInSquareFeet,

      -- Static Counts
      (SELECT COUNT(*) FROM builders WHERE builderadder = ?) AS totalBuilder,
      (SELECT COUNT(*) FROM employees WHERE projectpartnerid = ?) AS totalEmployee,
      (SELECT COUNT(*) FROM properties WHERE projectpartnerid = ?) AS totalProperty,
      (SELECT COUNT(*) FROM salespersons WHERE projectpartnerid = ?) AS totalSalesPartner,
      (SELECT COUNT(*) FROM territorypartner WHERE projectpartnerid = ?) AS totalTerritoryPartner,
      (SELECT COUNT(*) FROM tickets WHERE ticketadder = ?) AS totalTicket,

      -- Analytics
      (SELECT COUNT(*) FROM user_property_wishlist w 
        JOIN properties p2 ON p2.propertyid = w.property_id 
        WHERE p2.projectpartnerid = ?) AS propertyLikes,

      (SELECT IFNULL(SUM(pa.views),0) FROM property_analytics pa 
        JOIN properties p3 ON p3.propertyid = pa.property_id 
        WHERE p3.projectpartnerid = ?) AS propertyViews,

      (SELECT IFNULL(SUM(pa.share),0) FROM property_analytics pa 
        JOIN properties p4 ON p4.propertyid = pa.property_id 
        WHERE p4.projectpartnerid = ?) AS propertyShares,

      (SELECT IFNULL(SUM(pa.calls),0) FROM property_analytics pa 
        JOIN properties p5 ON p5.propertyid = pa.property_id 
        WHERE p5.projectpartnerid = ?) AS call_enquirers,

      (SELECT IFNULL(SUM(pa.whatsapp_enquiry),0) FROM property_analytics pa 
        JOIN properties p6 ON p6.propertyid = pa.property_id 
        WHERE p6.projectpartnerid = ?) AS whatsapp_enquirers

    FROM properties p
    LEFT JOIN enquirers e ON e.propertyid = p.propertyid
    LEFT JOIN propertyfollowup pf ON pf.enquirerid = e.enquirersid
    WHERE p.projectpartnerid = ?
  `;

  db.query(
    query,
    [id, id, id, id, id, email, id, id, id, id, id, id],
    (err, results) => {
      if (err) {
        console.error("Optimized Query Error:", err);
        return res.status(500).json({ error: err.message });
      }

      res.json(results[0]);
    },
  );
};

export const getCountOld = (req, res) => {
  const query = `
    SELECT
      (
        SELECT IFNULL(SUM(pf.dealamount), 0)
        FROM propertyfollowup pf
        JOIN enquirers e ON pf.enquirerid = e.enquirersid
        JOIN properties p ON e.propertyid = p.propertyid
        WHERE pf.status = 'Token' AND p.projectpartnerid = ?
      ) AS totalDealAmount,
       
      (
       SELECT IFNULL(SUM(pf.reparvcommission) / 2, 0)
       FROM propertyfollowup pf
       JOIN enquirers e ON pf.enquirerid = e.enquirersid
       JOIN properties p ON e.propertyid = p.propertyid
       WHERE pf.status = 'Token' AND p.projectpartnerid = ?
      ) AS selfEarning,

      (
        SELECT COUNT(e.enquirersid)
        FROM enquirers e
        JOIN properties p ON e.propertyid = p.propertyid
        WHERE e.status = 'Token' AND p.projectpartnerid = ?
      ) AS totalCustomer,

      (
        SELECT COUNT(e.enquirersid)
        FROM enquirers e
        JOIN properties p ON e.propertyid = p.propertyid
        WHERE e.status != 'Token' AND p.projectpartnerid = ? OR e.projectpartnerid = ?
      ) AS totalEnquirer,

      (
        SELECT IFNULL(SUM(p.carpetArea), 0)
        FROM enquirers e
        JOIN properties p ON e.propertyid = p.propertyid
        WHERE e.status = 'Token' AND p.projectpartnerid = ?
      ) AS totalDealInSquareFeet,

      (
        SELECT COUNT(builderid) 
        FROM builders  
        WHERE builderadder = ?
      ) AS totalBuilder,

      (
        SELECT COUNT(id) 
        FROM employees 
        WHERE projectpartnerid = ?
      ) AS totalEmployee,

      (
        SELECT COUNT(propertyid) 
        FROM properties 
        WHERE projectpartnerid = ?
      ) AS totalProperty,

      (
        SELECT COUNT(salespersonsid) 
        FROM salespersons
        WHERE projectpartnerid = ?
      ) AS totalSalesPartner,

      (
        SELECT COUNT(id) 
        FROM territorypartner 
        WHERE projectpartnerid = ?
      ) AS totalTerritoryPartner,

      (
        SELECT COUNT(ticketid) 
        FROM tickets 
        INNER JOIN projectpartner 
        ON projectpartner.adharno = tickets.ticketadder 
        WHERE tickets.ticketadder = ?
      ) AS totalTicket
  `;

  db.query(
    query,
    [
      req.projectPartnerUser?.id, // for projectpartnerid in totalDealAmount
      req.projectPartnerUser?.id, // projectpartnerid for selfEarning
      req.projectPartnerUser?.id, // for totalCustomer
      req.projectPartnerUser?.id, // for totalEnquirer
      req.projectPartnerUser?.id, // for totalEnquirer
      req.projectPartnerUser?.id, // for totalDealInSquareFeet
      req.projectPartnerUser?.adharId, // for totalBuilder
      req.projectPartnerUser?.id, // for totalEmployee
      req.projectPartnerUser?.id, // for totalProperty
      req.projectPartnerUser?.id, // for totalSalesPartner
      req.projectPartnerUser?.id, // for totalTerritoryPartner
      req.projectPartnerUser?.adharId, // for totalTicket
    ],
    (err, results) => {
      if (err) {
        console.error("Error fetching dashboard stats:", err);
        return res.status(500).json({ error: "Database error" });
      }

      return res.json(results[0]);
    },
  );
};

// **Get Partner Properties with Enquiry/Booking Status**
export const getProperties = (req, res) => {
  const partnerId = req.projectPartnerUser?.id;

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
    WHERE p.projectpartnerid = ?
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

export const getRecentEnquiries = (req, res) => {
  const userId = req.projectPartnerUser?.id;

  if (!userId) {
    return res
      .status(401)
      .json({ message: "Unauthorized Access, Please Login Again!" });
  }

  const sql = `
    SELECT 
      enquirers.*, 
      properties.frontView, 
      properties.seoSlug,
      properties.commissionAmount,

      -- Territory Info
      territorypartner.fullname AS territoryName,
      territorypartner.contact AS territoryContact,

      -- Project Partner Info
      projectpartner.fullname AS projectPartnerName,
      projectpartner.contact AS projectPartnerContact,

      -- Lister Role
      CASE 
        WHEN enquirers.salespartner IS NOT NULL THEN 'Sales Partner'
        WHEN enquirers.territorypartner IS NOT NULL THEN 'Territory Partner'
        WHEN enquirers.projectpartner IS NOT NULL THEN 'Project Partner'
        ELSE 'Unknown'
      END AS listerRole,

      -- Lister Name
      COALESCE(
        salespersons.fullname,
        territoryLister.fullname,
        projectLister.fullname
      ) AS listerName,

      -- Lister Contact
      COALESCE(
        salespersons.contact,
        territoryLister.contact,
        projectLister.contact
      ) AS listerContact

    FROM enquirers

    LEFT JOIN properties 
      ON enquirers.propertyid = properties.propertyid

    LEFT JOIN territorypartner 
      ON territorypartner.id = enquirers.territorypartnerid

    LEFT JOIN projectpartner 
      ON projectpartner.id = enquirers.projectpartnerid

    -- Lister joins
    LEFT JOIN salespersons 
      ON enquirers.salespartner = salespersons.salespersonsid

    LEFT JOIN territorypartner AS territoryLister 
      ON enquirers.territorypartner = territoryLister.id

    LEFT JOIN projectpartner AS projectLister 
      ON enquirers.projectpartner = projectLister.id

    WHERE enquirers.status != 'Token'
      AND (
        properties.projectpartnerid = ?
        OR enquirers.projectpartnerid = ?
        OR enquirers.projectbroker = ?
      )

    ORDER BY enquirers.enquirersid DESC
    LIMIT 5
  `;

  const params = [userId, userId, userId];

  db.query(sql, params, (err, result) => {
    if (err) {
      console.error("Error fetching recent enquiries:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    const formatted = result.map((row) => ({
      ...row,
      created_at: row.created_at
        ? moment
            .utc(row.created_at)
            .tz("Asia/Kolkata")
            .format("DD MMM YYYY | hh:mm A")
        : null,
    }));

    res.json(formatted);
  });
};

// **Fetch All **
export const getBookedProperties = (req, res) => {
  const userId = req.projectPartnerUser?.id;
  if (!userId) {
    return res
      .status(401)
      .json({ message: "Unauthorized Access, Please Login Again!" });
  }
  const sql = `
    SELECT 
      enquirers.*, 
      properties.frontView,
      properties.seoSlug,
      properties.commissionType,
      properties.commissionAmount,
      properties.commissionPercentage,
      territorypartner.fullname AS territoryName, 
      territorypartner.contact AS territoryContact,
      propertyfollowup.*
    FROM enquirers 
    LEFT JOIN properties ON enquirers.propertyid = properties.propertyid
    LEFT JOIN territorypartner ON enquirers.territorypartnerid = territorypartner.id
    LEFT JOIN propertyfollowup ON propertyfollowup.enquirerid = enquirers.enquirersid
    WHERE enquirers.status = 'Token' AND propertyfollowup.status = 'Token' AND properties.projectpartnerid = ?
    ORDER BY propertyfollowup.created_at DESC
  `;

  db.query(sql, [userId], (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    const formatted = result.map((row) => ({
      ...row,
      created_at: moment
        .utc(row.created_at)
        .tz("Asia/Kolkata")
        .format("DD MMM YYYY | hh:mm A"),
      updated_at: moment
        .utc(row.updated_at)
        .tz("Asia/Kolkata")
        .format("DD MMM YYYY | hh:mm A"),
    }));

    res.json(formatted);
  });
};
