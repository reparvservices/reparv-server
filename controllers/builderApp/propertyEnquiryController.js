import db from "../../config/dbconnect.js";
import moment from "moment-timezone";
import bcrypt from "bcryptjs";


//Get Builder property enquiries
export const getEnquiries = (req, res) => {

  const Id = req.user.id;
  if (!Id) {
    console.log("Invalid Builder Id: " + Id);
    return res.status(400).json({ message: "Invalid Builder Id" });
  }

 const sql = `
    SELECT 
        enquirers.*, 
        properties.frontView, 
        properties.seoSlug, 
        properties.commissionAmount,
        properties.builderid, 
        territorypartner.fullname AS territoryName,
        territorypartner.contact AS territoryContact
    FROM enquirers 
    LEFT JOIN properties 
        ON enquirers.propertyid = properties.propertyid
    LEFT JOIN territorypartner 
        ON territorypartner.id = enquirers.territorypartnerid 
    WHERE 
        enquirers.status != 'Token' 
        AND properties.builderid = ? 
    ORDER BY enquirers.enquirersid DESC
`;

  db.query(sql, [Id], (err, results) => {
    if (err) {
      console.error("Database Query Error:", err);
      return res
        .status(500)
        .json({ message: "Database query error", error: err });
    }
    const formatted = results.map((row) => ({
      ...row,
      created_at: moment.utc(row.created_at).tz("Asia/Kolkata").format("DD MMM YYYY | hh:mm A"),
      updated_at: moment.utc(row.updated_at).tz("Asia/Kolkata").format("DD MMM YYYY | hh:mm A"),
    }));

    res.json(formatted);
  });
};

//Get builder token property 
export const getBookedProperty = (req, res) => {
console.log('ss');

  const Id = req.user.id;
  if (!Id) {
    console.log("Invalid Builder Id: " + Id);
    return res.status(400).json({ message: "Invalid Builder Id" });
  }

 const sql = `
    SELECT 
        enquirers.*, 
        properties.frontView, 
        properties.seoSlug, 
        properties.commissionAmount,
        properties.builderid, 
        territorypartner.fullname AS territoryName,
        territorypartner.contact AS territoryContact
    FROM enquirers 
    LEFT JOIN properties 
        ON enquirers.propertyid = properties.propertyid
    LEFT JOIN territorypartner 
        ON territorypartner.id = enquirers.territorypartnerid 
    WHERE 
        enquirers.status = 'Token' 
        AND properties.builderid = ? 
    ORDER BY enquirers.enquirersid DESC
`;

  db.query(sql, [Id], (err, results) => {
    if (err) {
      console.error("Database Query Error:", err);
      return res
        .status(500)
        .json({ message: "Database query error", error: err });
    }
    const formatted = results.map((row) => ({
      ...row,
      created_at: moment.utc(row.created_at).tz("Asia/Kolkata").format("DD MMM YYYY | hh:mm A"),
      updated_at: moment.utc(row.updated_at).tz("Asia/Kolkata").format("DD MMM YYYY | hh:mm A"),
    }));

    res.json(formatted);
  });
};

//Get Count Data 
export const getCountData = (req, res) => {
  try {
    const Id = req.user?.id;
    if (!Id) {
      console.log("Invalid Builder Id: " + Id);
      return res.status(400).json({ message: "Invalid Builder Id" });
    }

    const sql = `
      SELECT
        SUM(CASE WHEN e.status != 'Token' THEN 1 ELSE 0 END) AS enquiriesCount,
        SUM(CASE WHEN e.status = 'Token' THEN 1 ELSE 0 END) AS bookedCount,
        (
          SELECT COUNT(*) 
          FROM properties p 
          WHERE p.status = 'Active' 
            AND p.approve = 'Approved' 
            AND p.builderid = ?
        ) AS propertyCount,
        (
          SELECT SUM(pf.dealamount)
          FROM enquirers eq
          LEFT JOIN properties pp ON eq.propertyid = pp.propertyid
          LEFT JOIN propertyfollowup pf ON pf.enquirerid = eq.enquirersid
          WHERE eq.status != 'Token'
            AND pp.builderid = ?
        ) AS totalDealAmount
      FROM enquirers e
      LEFT JOIN properties pr
        ON e.propertyid = pr.propertyid
      WHERE pr.builderid = ?
    `;

    db.query(sql, [Id, Id, Id], (err, results) => {
      if (err) {
        console.error("Database Query Error:", err);
        return res.status(500).json({ message: "Database query error", error: err });
      }

      res.json({
        enquiriesCount: results[0]?.enquiriesCount || 0,
        bookedCount: results[0]?.bookedCount || 0,
        propertyCount: results[0]?.propertyCount || 0,
        totalDealAmount: results[0]?.totalDealAmount || 0
      });
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Internal server error", error });
  }
};


