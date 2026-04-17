import db from "#db";

export const getCount = (req, res) => {
  const query = `
    SELECT
      (
        SELECT IFNULL(SUM(pf.dealamount), 0)
        FROM propertyfollowup pf
        JOIN enquirers e ON pf.enquirerid = e.enquirersid
        WHERE pf.status = 'Token' AND e.salespersonid = ?
      ) AS totalDealAmount,

      (
        SELECT COUNT(e.enquirersid)
        FROM enquirers e
        WHERE e.status = 'Token' AND e.salespersonid = ?
      ) AS totalCustomer,

      (
        SELECT IFNULL(SUM(p.carpetArea), 0)
        FROM enquirers e
        JOIN properties p ON e.propertyid = p.propertyid
        WHERE e.status = 'Token' AND e.salespersonid = ?
      ) AS totalDealInSquareFeet,

      (
        SELECT IFNULL(SUM(pf.salescommission), 0)
        FROM propertyfollowup pf
        JOIN enquirers e ON pf.enquirerid = e.enquirersid
        WHERE pf.status = 'Token' AND e.salespersonid = ?
      ) AS selfEarning,

      (
        SELECT COUNT(e.enquirersid)
        FROM enquirers e
        WHERE e.salespersonid = ?
      ) AS totalEnquiry,

      (
        SELECT COUNT(propertyid)
        FROM properties
      ) AS totalProperty,

      (
        SELECT COUNT(ticketid)
        FROM tickets
        WHERE ticketadder = ?
      ) AS totalTicket
  `;

  const values = [
    req.salesUser?.id, // totalDealAmount
    req.salesUser?.id, // totalCustomer
    req.salesUser?.id, // totalDealInSquareFeet
    req.salesUser?.id, // selfEarning
    req.salesUser?.id, // totalEnquiry
    req.salesUser?.email, // totalTicket
  ];

  db.query(query, values, (err, results) => {
    if (err) {
      console.error("Error fetching dashboard stats:", err);
      return res.status(500).json({ error: "Database error" });
    }

    return res.json(results[0]);
  });
};

export const getData = (req, res) => {
  const query = `SELECT
    (SELECT COUNT(enquirersid) FROM enquirers WHERE salespersonid = ?) AS totalEnquiry,
    (SELECT COUNT(propertyid) FROM properties) AS totalProperty,
    (SELECT COUNT(ticketid) 
     FROM tickets 
     INNER JOIN salespersons ON salespersons.adharno = tickets.ticketadder 
     WHERE tickets.ticketadder = ?) AS totalTicket`;

  db.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching dashboard stats:", err);
      return res.status(500).json({ error: "Database error" });
    }

    return res.json(results[0]); // Since it's a single row
  });
};

export const getRecentEnquiries = (req, res) => {
  const userId = req.salesUser?.id;

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
        enquirers.salespersonid = ?
        OR enquirers.salesbroker = ?
      )

    ORDER BY enquirers.enquirersid DESC
    LIMIT 5
  `;

  const params = [userId, userId];

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
