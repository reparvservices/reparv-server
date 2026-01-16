import axios from "axios";
import db from "../../config/dbconnect.js";
import moment from "moment";
import { sanitize } from "../../utils/sanitize.js";

// * Fetch All Enquiries with Enquiry Lister Details
export const getAll = (req, res) => {
  const userId = req.projectPartnerUser?.id;
  if (!userId) {
    return res
      .status(401)
      .json({ message: "Unauthorized Access, Please Login Again!" });
  }

  const enquirySource = req.params.source;
  if (!enquirySource) {
    return res
      .status(401)
      .json({ message: "Enquiry Source Not Selected" });
  }

  let sql;
  let params = [userId, userId, userId]; // default params

  // Onsite Enquiries (Website Direct)
  if (enquirySource === "Onsite") {
    sql = `
      SELECT 
        enquirers.*, 
        properties.frontView, properties.seoSlug, properties.commissionAmount,
        territorypartner.fullname AS territoryName, 
        territorypartner.contact AS territoryContact
      FROM enquirers 
      LEFT JOIN properties ON enquirers.propertyid = properties.propertyid
      LEFT JOIN territorypartner ON territorypartner.id = enquirers.territorypartnerid
      WHERE properties.status = 'active' 
        AND properties.approve = 'Approved' 
        AND enquirers.source = "Onsite" 
        AND enquirers.status != 'Token' 
        AND properties.projectpartnerid = ?
      ORDER BY enquirers.enquirersid DESC`;
    params = [userId];
  } 
  
  // Direct Enquiries (with Lister Info)
  else if (enquirySource === "Direct") {
    sql = `
      SELECT 
        enquirers.*, 
        properties.frontView, properties.seoSlug, properties.commissionAmount,

        -- Territory & Project Partner Info
        territorypartner.fullname AS territoryName, 
        territorypartner.contact AS territoryContact,
        projectpartner.fullname AS projectPartnerName, 
        projectpartner.contact AS projectPartnerContact,

        -- Enquiry Lister Info
        CASE 
          WHEN enquirers.salespartner IS NOT NULL THEN 'Sales Partner'
          WHEN enquirers.territorypartner IS NOT NULL THEN 'Territory Partner'
          WHEN enquirers.projectpartner IS NOT NULL THEN 'Project Partner'
          ELSE '-- Unknown --'
        END AS listerRole,

        COALESCE(
          salespersons.fullname,
          territoryLister.fullname,
          projectLister.fullname
        ) AS listerName,

        COALESCE(
          salespersons.contact,
          territoryLister.contact,
          projectLister.contact
        ) AS listerContact

      FROM enquirers
      LEFT JOIN properties ON enquirers.propertyid = properties.propertyid
      LEFT JOIN territorypartner ON territorypartner.id = enquirers.territorypartnerid
      LEFT JOIN projectpartner ON projectpartner.id = enquirers.projectpartnerid

      -- Join for dynamic lister details
      LEFT JOIN salespersons ON enquirers.salespartner = salespersons.salespersonsid
      LEFT JOIN territorypartner AS territoryLister ON enquirers.territorypartner = territoryLister.id
      LEFT JOIN projectpartner AS projectLister ON enquirers.projectpartner = projectLister.id

      WHERE enquirers.source = "Direct"
        AND enquirers.status != 'Token'
        AND (enquirers.projectpartnerid = ? OR enquirers.projectbroker = ? OR enquirers.projectpartner = ?)
      ORDER BY enquirers.enquirersid DESC`;
    params = [userId, userId, userId];
  } 
  
  // CSV Imported Enquiries
  else if (enquirySource === "CSV") {
    sql = `
      SELECT 
        enquirers.*, 
        properties.frontView, properties.seoSlug, properties.commissionAmount,
        territorypartner.fullname AS territoryName, 
        territorypartner.contact AS territoryContact,
        projectpartner.fullname AS projectPartnerName, 
        projectpartner.contact AS projectPartnerContact
      FROM enquirers 
      LEFT JOIN properties ON enquirers.propertyid = properties.propertyid
      LEFT JOIN territorypartner ON territorypartner.id = enquirers.territorypartnerid
      LEFT JOIN projectpartner ON projectpartner.id = enquirers.projectpartnerid
      WHERE enquirers.source = "CSV File" 
        AND enquirers.status != 'Token' 
        AND (properties.projectpartnerid = ? OR enquirers.projectpartnerid = ? OR enquirers.projectbroker = ?)
      ORDER BY enquirers.enquirersid DESC`;
    params = [userId, userId, userId];
  } 

  // Ads Enquiries
  else if (enquirySource === "Ads") {
    sql = `
      SELECT 
        enquirers.*, 
        properties.frontView, properties.seoSlug, properties.commissionAmount,
        territorypartner.fullname AS territoryName, 
        territorypartner.contact AS territoryContact,
        projectpartner.fullname AS projectPartnerName, 
        projectpartner.contact AS projectPartnerContact
      FROM enquirers 
      LEFT JOIN properties ON enquirers.propertyid = properties.propertyid
      LEFT JOIN territorypartner ON territorypartner.id = enquirers.territorypartnerid
      LEFT JOIN projectpartner ON projectpartner.id = enquirers.projectpartnerid
      WHERE enquirers.source = "Ads" 
        AND enquirers.status != 'Token' 
        AND (properties.projectpartnerid = ? OR enquirers.projectpartnerid = ? OR enquirers.projectbroker = ?)
      ORDER BY enquirers.enquirersid DESC`;
    params = [userId, userId, userId];
  } 
  
  // Digital Broker Enquiries (Now Includes Enquiry Lister)
  else if (enquirySource === "Digital Broker") {
    sql = `
      SELECT 
        enquirers.*, 
        properties.frontView, properties.seoSlug, properties.commissionAmount,

        -- Partner Info
        territorypartner.fullname AS territoryName, 
        territorypartner.contact AS territoryContact,
        projectpartner.fullname AS projectPartnerName, 
        projectpartner.contact AS projectPartnerContact,

        -- Enquiry Lister Info
        CASE 
          WHEN enquirers.salespartner IS NOT NULL THEN 'Sales Partner'
          WHEN enquirers.territorypartner IS NOT NULL THEN 'Territory Partner'
          WHEN enquirers.projectpartner IS NOT NULL THEN 'Project Partner'
          ELSE 'Unknown'
        END AS listerRole,

        COALESCE(
          salespersons.fullname,
          territoryLister.fullname,
          projectLister.fullname
        ) AS listerName,

        COALESCE(
          salespersons.contact,
          territoryLister.contact,
          projectLister.contact
        ) AS listerContact

      FROM enquirers 
      LEFT JOIN properties ON enquirers.propertyid = properties.propertyid
      LEFT JOIN territorypartner ON territorypartner.id = enquirers.territorypartnerid
      LEFT JOIN projectpartner ON projectpartner.id = enquirers.projectpartnerid

      -- Join for dynamic lister details
      LEFT JOIN salespersons ON enquirers.salespartner = salespersons.salespersonsid
      LEFT JOIN territorypartner AS territoryLister ON enquirers.territorypartner = territoryLister.id
      LEFT JOIN projectpartner AS projectLister ON enquirers.projectpartner = projectLister.id

      WHERE enquirers.status != 'Token' 
        AND enquirers.projectpartnerid = ?
        AND (
          enquirers.salesbroker IS NOT NULL 
          OR enquirers.territorybroker IS NOT NULL 
          OR enquirers.projectbroker IS NOT NULL
        )
      ORDER BY enquirers.enquirersid DESC`;
    params = [userId];
  } 
  
  // Default (All Enquiries)
  else {
    sql = `
      SELECT 
        enquirers.*, 
        properties.frontView, properties.seoSlug, properties.commissionAmount,
        territorypartner.fullname AS territoryName, 
        territorypartner.contact AS territoryContact
      FROM enquirers 
      LEFT JOIN properties ON enquirers.propertyid = properties.propertyid  
      LEFT JOIN territorypartner ON territorypartner.id = enquirers.territorypartnerid
      WHERE enquirers.status != 'Token'
        AND (
          properties.projectpartnerid = ? 
          OR enquirers.projectpartnerid = ? 
          OR enquirers.projectbroker = ?
        )
      ORDER BY enquirers.enquirersid DESC`;
  }

  // Execute Query
  db.query(sql, params, (err, result) => {
    if (err) {
      console.error("Error fetching Enquirers:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    const formatted = result.map((row) => ({
      ...row,
      created_at: row.created_at
        ? moment(row.created_at).format("DD MMM YYYY | hh:mm A")
        : null,
      updated_at: row.updated_at
        ? moment(row.updated_at).format("DD MMM YYYY | hh:mm A")
        : null,
    }));

    res.json(formatted);
  });
};

// Fetch All Enquiries
export const getAllOld = (req, res) => {
  const userId = req.projectPartnerUser?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized Access, Please Login Again!" });
  }

  const enquirySource = req.params.source;
  if (!enquirySource) {
    return res.status(401).json({ message: "Enquiry Source Not Selected" });
  }

  let sql;
  let params = [userId, userId, userId]; // for default query

  if (enquirySource === "Onsite") {
    sql = `
      SELECT enquirers.*, properties.frontView, properties.seoSlug, properties.commissionAmount,
             territorypartner.fullname AS territoryName, 
             territorypartner.contact AS territoryContact
      FROM enquirers 
      LEFT JOIN properties ON enquirers.propertyid = properties.propertyid
      LEFT JOIN territorypartner ON territorypartner.id = enquirers.territorypartnerid
      WHERE properties.status = 'active' 
        AND properties.approve = 'Approved' 
        AND enquirers.source = "Onsite" 
        AND enquirers.status != 'Token' 
        AND properties.projectpartnerid = ?
      ORDER BY enquirers.enquirersid DESC`;
    params = [userId];
  } 
  else if (enquirySource === "Direct") {
    sql = `
      SELECT enquirers.*, properties.frontView, properties.seoSlug, properties.commissionAmount,
             territorypartner.fullname AS territoryName, 
             territorypartner.contact AS territoryContact
      FROM enquirers 
      LEFT JOIN properties ON enquirers.propertyid = properties.propertyid
      LEFT JOIN territorypartner ON territorypartner.id = enquirers.territorypartnerid
      WHERE enquirers.source = "Direct" 
        AND enquirers.status != 'Token' 
        AND (enquirers.projectpartnerid = ? OR enquirers.projectbroker = ?)
      ORDER BY enquirers.enquirersid DESC`;
    params = [userId, userId];
  } 
  else if (enquirySource === "CSV") {
    sql = `
      SELECT enquirers.*, properties.frontView, properties.seoSlug, properties.commissionAmount,
             territorypartner.fullname AS territoryName, 
             territorypartner.contact AS territoryContact
      FROM enquirers 
      LEFT JOIN properties ON enquirers.propertyid = properties.propertyid
      LEFT JOIN territorypartner ON territorypartner.id = enquirers.territorypartnerid
      WHERE enquirers.source = "CSV File" 
        AND enquirers.status != 'Token' 
        AND (properties.projectpartnerid = ? OR enquirers.projectbroker = ?)
      ORDER BY enquirers.enquirersid DESC`;
    params = [userId, userId];
  }  else if (enquirySource === "Digital Broker") {
    sql = `SELECT enquirers.*, properties.frontView, properties.seoSlug, properties.commissionAmount,
                  territorypartner.fullname AS territoryName, 
                  territorypartner.contact AS territoryContact,
                  projectpartner.fullname AS projectPartnerName, 
                  projectpartner.contact AS projectPartnerContact
           FROM enquirers 
           LEFT JOIN properties ON enquirers.propertyid = properties.propertyid
           LEFT JOIN territorypartner ON territorypartner.id = enquirers.territorypartnerid
           LEFT JOIN projectpartner ON projectpartner.id = enquirers.projectpartnerid
           WHERE enquirers.status != 'Token' AND enquirers.projectpartnerid = ?
             AND (enquirers.salesbroker IS NOT NULL OR enquirers.territorybroker IS NOT NULL OR enquirers.projectbroker IS NOT NULL)
           ORDER BY enquirers.enquirersid DESC`;
    params = [userId];
  } else {
    sql = `
      SELECT enquirers.*, properties.frontView, properties.seoSlug, properties.commissionAmount,
             territorypartner.fullname AS territoryName, 
             territorypartner.contact AS territoryContact
      FROM enquirers 
      LEFT JOIN properties ON enquirers.propertyid = properties.propertyid  
      LEFT JOIN territorypartner ON territorypartner.id = enquirers.territorypartnerid
      WHERE enquirers.status != 'Token'
        AND (
          properties.projectpartnerid = ? 
          OR enquirers.projectpartnerid = ? 
          OR enquirers.projectbroker = ?
        )
      ORDER BY enquirers.enquirersid DESC`;
  }

  db.query(sql, params, (err, result) => {
    if (err) {
      console.error("Error fetching Enquirers:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    const formatted = result.map((row) => ({
      ...row,
      created_at: moment(row.created_at).format("DD MMM YYYY | hh:mm A"),
      updated_at: moment(row.updated_at).format("DD MMM YYYY | hh:mm A"),
    }));

    res.json(formatted);
  });
};

// **Fetch Single by ID**
export const getById = (req, res) => {
  const Id = parseInt(req.params.id);
  const sql = `SELECT enquirers.*, 
       territorypartner.fullname AS territoryName,
       territorypartner.contact AS territoryContact,
       territoryenquiry.followup AS territoryFollowUp,
       territoryenquiry.status AS territoryStatus 
       FROM enquirers 
       LEFT JOIN territorypartner ON territorypartner.id = enquirers.territorypartnerid 
       LEFT JOIN territoryenquiry ON territoryenquiry.enquirerid = enquirers.enquirersid
       WHERE enquirersid = ?`;

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Enquiry not found" });
    }
    res.json(result[0]);
  });
};

export const getProperties = (req, res) => {
  const userId = req.projectPartnerUser?.id;
  if (!userId) {
    return res
      .status(401)
      .json({ message: "Unauthorized Access, Please Login Again!" });
  }

  // Step 1: Get enquiry details from body
  const { minbudget, maxbudget, state, city, category } = req.body;

  // Basic validation
  if (!state || !city || !category) {
    return res.status(400).json({
      success: false,
      message: "State, City, and Category are required.",
    });
  }

  // Parse budgets safely
  const minBudgetValue = parseFloat(minbudget) || 0;
  const maxBudgetValue = parseFloat(maxbudget) || Number.MAX_SAFE_INTEGER;

  // Step 2: Get matching properties
  const propertySql = `
    SELECT * FROM properties
    WHERE CAST(totalOfferPrice AS DECIMAL(15,2)) BETWEEN ? AND ?
      AND propertyCategory = ?
      AND state = ?
      AND city = ?
      AND projectpartnerid = ?
    ORDER BY created_at DESC
  `;

  db.query(
    propertySql,
    [minBudgetValue, maxBudgetValue, category, state, city, userId],
    (err, propertyResults) => {
      if (err) {
        console.error("Error fetching properties:", err);
        return res.status(500).json({
          success: false,
          message: "Database error while fetching properties.",
          error: err,
        });
      }

      if (!propertyResults || propertyResults.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Properties not found based on your requirement.",
        });
      }

      res.json({
        success: true,
        message: "Properties fetched successfully.",
        data: propertyResults,
      });
    }
  );
};

export const getPropertyList = (req, res) => {
  const userId = req.projectPartnerUser.id;
  if(!userId){
    return res.status(401).json({message: "Unauthorized Access, Please Login Again!"});
  }
  const enquiryId = req.params.id;

  // Step 1: Get Enquiry details
  const enquirySql = "SELECT * FROM enquirers WHERE enquirersid = ?";
  db.query(enquirySql, [enquiryId], (err, enquiryResults) => {
    if (err) {
      console.error("Error fetching enquiry:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (enquiryResults.length === 0) {
      return res.status(404).json({ message: "Enquiry not found" });
    }

    const enquiry = enquiryResults[0];

    // Parse budgets to numbers (fallbacks to avoid NaN)
    const minbudget = parseFloat(enquiry.minbudget) || 0;
    const maxbudget = parseFloat(enquiry.maxbudget) || Number.MAX_SAFE_INTEGER;
    const { category, state, city } = enquiry;

    // Step 2: Get matching properties
    const propertySql = `
      SELECT * FROM properties
      WHERE CAST(totalOfferPrice AS DECIMAL(15,2)) BETWEEN ? AND ?
        AND propertyCategory = ?
        AND state = ?
        AND city = ?
        AND projectpartnerid = ?
      ORDER BY created_at DESC
    `;

    db.query(
      propertySql,
      [minbudget, maxbudget, category, state, city, userId],
      (err, propertyResults) => {
        if (err) {
          console.error("Error fetching properties:", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }

        res.json(propertyResults);
      }
    );
  });
};

// **Fetch All **
export const getRemarkList = (req, res) => {
  const enquiryId = req.params.id;
  const sql =
    "SELECT * FROM propertyfollowup WHERE enquirerid = ? ORDER BY propertyfollowup.created_at";
  db.query(sql, [enquiryId], (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    const formatted = result.map((row) => ({
      ...row,
      visitdate: row.visitdate
          ? moment(row.visitdate).format("DD MMM YYYY")
          : null,
    }));

    res.json(formatted);
  });
};

/* Change status */
export const status = (req, res) => {
  const { enquiryStatus } = req.body;
  if (enquiryStatus === "") {
    return res.status(400).json({ message: "Please Select Status!" });
  }

  const Id = parseInt(req.params.id);
  //console.log(Id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Enquiry ID" });
  }

  db.query(
    "SELECT * FROM enquirers WHERE enquirersid = ?",
    [Id],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      db.query(
        "UPDATE enquirers SET status = ? WHERE enquirersid = ?",
        [enquiryStatus, Id],
        (err, result) => {
          if (err) {
            console.error("Error deleting :", err);
            return res
              .status(500)
              .json({ message: "Database error", error: err });
          }
          res
            .status(200)
            .json({ message: "Property status change successfully" });
        }
      );
    }
  );
};


export const assignEnquiry = async (req, res) => {
  const { salespersonid, salesperson, salespersoncontact } = req.body;
  const Id = parseInt(req.params.id);
  const currentDate = moment().format("YYYY-MM-DD HH:mm:ss");

  if (!salespersonid || !salesperson || !salespersoncontact) {
    return res.status(400).json({ message: "All Fields Required" });
  }

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Enquiry ID" });
  }

  const salesInfo = `${salesperson} - ${salespersoncontact}`;

  db.query(
    "SELECT * FROM enquirers WHERE enquirersid = ?",
    [Id],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      if (result.length === 0) {
        return res.status(404).json({ message: "Enquiry not found" });
      }

      db.query(
        "UPDATE enquirers SET salespersonid = ?, assign = ?, updated_at = ? WHERE enquirersid = ?",
        [salespersonid, salesInfo, currentDate, Id],
        async (err, result) => {
          if (err) {
            console.error("Error assigning salesperson:", err);
            return res
              .status(500)
              .json({ message: "Database error", error: err });
          }

          // WhatsApp message logic
          const apikey = "1c26ea744ef248f080ee1c5270081c0b";
          const msg = `🌟 *REPARV* - New Enquiry Alert 🌟

        Hello ${salesperson},

        You have been assigned a new enquiry.

        Please check the details and take quick action.

        📱 Open the *REPARV Sales Partner App* or  
        🖥️ Visit: https://sales.reparv.in/

        Thank you,  
        Team REPARV`;

          const encodedMsg = encodeURIComponent(msg);
          const apiUrl = `http://wapi.kinextechnologies.in/wapp/api/send?apikey=${apikey}&mobile=${salespersoncontact}&msg=${encodedMsg}`;

          try {
            const response = await axios.get(apiUrl);
            console.log("WhatsApp API response:", response.data);
          } catch (error) {
            console.error("WhatsApp send error:", error.message);
            // optional: log but do not block assignment
          }

          return res.status(200).json({
            message: `Enquiry assigned successfully to ${salesperson}`,
            assigned_to: {
              id: salespersonid,
              name: salesperson,
              contact: salespersoncontact,
            },
          });
        }
      );
    }
  );
};

export const updateEnquirerProperty = async (req, res) => {
  const enquiryId = parseInt(req.params.id);
  if (isNaN(enquiryId)) {
    return res.status(400).json({ message: "Invalid Enquiry ID" });
  }

  const { propertyId } = req.body;
  if (!propertyId) {
    return res.status(400).json({ message: "Property Id Required" });
  }

  db.query(
    "SELECT * FROM enquirers WHERE enquirersid = ?",
    [enquiryId],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      if (result.length === 0) {
        return res.status(404).json({ message: "Enquiry not found" });
      }

      db.query(
        "UPDATE enquirers SET propertyid = ? WHERE enquirersid = ?",
        [propertyId, enquiryId],
        (err, result) => {
          if (err) {
            console.error("Error Update Property Enquiry :", err);
            return res
              .status(500)
              .json({ message: "Database error", error: err });
          }
          res.status(200).json({
            message: "Enquirer Property Updated Successfully",
          });
        }
      );
    }
  );
};

// **Delete **
export const del = (req, res) => {
  const Id = parseInt(req.params.id);

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Enquiry ID" });
  }

  db.query(
    "SELECT * FROM enquirers WHERE enquirersid = ?",
    [Id],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      if (result.length === 0) {
        return res.status(404).json({ message: "Enquiry not found" });
      }

      db.query("DELETE FROM enquirers WHERE enquirersid = ?", [Id], (err) => {
        if (err) {
          console.error("Error deleting :", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }
        res.status(200).json({ message: "Enquiry deleted successfully" });
      });
    }
  );
};

/* Visit Scheduled */

export const visitScheduled = (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const { visitDate, visitRemark, enquiryStatus } = req.body;

  if (!visitDate || !visitRemark || !enquiryStatus) {
    return res
      .status(400)
      .json({ message: "Please add visit date and remark!" });
  }

  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Enquiry ID" });
  }

  db.query(
    "SELECT * FROM enquirers WHERE enquirersid = ?",
    [Id],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      if (result.length === 0) {
        return res.status(404).json({ message: "Enquirer not found" });
      }

      const insertSQL = `
      INSERT INTO propertyfollowup (enquirerid, visitdate, remark, status, updated_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`;

      db.query(
        insertSQL,
        [Id, visitDate, visitRemark, enquiryStatus, currentdate, currentdate],
        (err, insertResult) => {
          if (err) {
            console.error("Error inserting visit:", err);
            return res
              .status(500)
              .json({ message: "Database error", error: err });
          }

          res.status(201).json({
            message: "Visit added successfully",
            Id: insertResult.insertId,
          });
        }
      );
    }
  );
};

export const token = (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const { paymenttype, tokenamount, remark, dealamount, enquiryStatus } =
    req.body;
  const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

  if (
    !paymenttype ||
    !tokenamount ||
    !remark ||
    !dealamount ||
    !enquiryStatus
  ) {
    return res.status(400).json({ message: "Please add all required fields!" });
  }

  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Enquiry ID" });
  }

  // Step 1: Get Enquirer (to access propertyid)
  db.query(
    "SELECT * FROM enquirers WHERE enquirersid = ?",
    [Id],
    (err, enquirerResult) => {
      if (err)
        return res.status(500).json({ message: "Database error", error: err });
      if (enquirerResult.length === 0)
        return res.status(404).json({ message: "Enquirer not found" });

      const enquirer = enquirerResult[0];
      const propertyId = enquirer.propertyid;

      // Step 2: Get Property data
      db.query(
        "SELECT commissionType, commissionAmount, commissionPercentage FROM properties WHERE propertyid = ?",
        [propertyId],
        (err, propertyResult) => {
          if (err)
            return res
              .status(500)
              .json({ message: "Property fetch error", error: err });
          if (propertyResult.length === 0)
            return res.status(404).json({ message: "Property not found" });

          const property = propertyResult[0];
          let { commissionType, commissionAmount, commissionPercentage } =
            property;

          commissionType = commissionType || "";
          commissionPercentage = Number(commissionPercentage) || 0;
          let finalCommissionAmount = Number(commissionAmount) || 0;

          // If type is percentage, calculate commissionAmount from dealamount
          if (commissionType.toLowerCase() === "percentage") {
            finalCommissionAmount =
              (Number(dealamount) * commissionPercentage) / 100;
          }

          // Split commission
          const reparvCommission = (finalCommissionAmount * 40) / 100;

          const grossSalesCommission = (finalCommissionAmount * 40) / 100;
          const salesCommission =
            grossSalesCommission - (grossSalesCommission * 2) / 100;

          const grossTerritoryCommission = (finalCommissionAmount * 20) / 100;
          const territoryCommission =
            grossTerritoryCommission - (grossTerritoryCommission * 2) / 100;

          const TDS =
            (grossSalesCommission * 2) / 100 +
            (grossTerritoryCommission * 2) / 100;

          // Step 3: Insert into propertyfollowup
          const insertSQL = `
          INSERT INTO propertyfollowup (
            enquirerid, paymenttype, tokenamount, remark, dealamount, status, 
            totalcommission, reparvcommission, salescommission, territorycommission, tds, paymentimage,
            updated_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

          db.query(
            insertSQL,
            [
              Id,
              paymenttype,
              tokenamount,
              remark,
              dealamount,
              enquiryStatus,
              finalCommissionAmount,
              reparvCommission,
              salesCommission,
              territoryCommission,
              TDS,
              imagePath,
              currentdate,
              currentdate,
            ],
            (err, insertResult) => {
              if (err)
                return res
                  .status(500)
                  .json({ message: "Insert error", error: err });

              res.status(201).json({
                message: "Token added successfully",
                followupId: insertResult.insertId,
                commissionBreakdown: {
                  totalCommission: finalCommissionAmount,
                  salesCommission,
                  reparvCommission,
                  territoryCommission,
                },
              });
            }
          );
        }
      );
    }
  );
};

export const followUp = (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const { followUpRemark, visitDate, enquiryStatus } = req.body;

  if (!followUpRemark || !enquiryStatus) {
    return res.status(400).json({ message: "Please add remark!" });
  }

  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Enquiry ID" });
  }

  // Format dates to remove time portion
  let formattedVisitDate = null;

  if (visitDate && visitDate.trim() !== "") {
    // Check if it's a valid date
    if (moment(visitDate, ["YYYY-MM-DD", moment.ISO_8601], true).isValid()) {
      formattedVisitDate = moment(visitDate).format("YYYY-MM-DD");
    } else {
      formattedVisitDate = null; // fallback instead of "Invalid date"
    }
  }

  db.query(
    "SELECT * FROM enquirers WHERE enquirersid = ?",
    [Id],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      if (result.length === 0) {
        return res.status(404).json({ message: "Enquiry not found" });
      }

      const insertSQL = `
      INSERT INTO propertyfollowup (enquirerid, remark, visitdate, status, updated_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`;

      db.query(
        insertSQL,
        [
          Id,
          followUpRemark,
          sanitize(formattedVisitDate),
          enquiryStatus,
          currentdate,
          currentdate,
        ],
        (err, insertResult) => {
          if (err) {
            console.error("Error inserting visit:", err);
            return res
              .status(500)
              .json({ message: "Database error", error: err });
          }

          res.status(201).json({
            message: "Follow Up remark added successfully",
            Id: insertResult.insertId,
          });
        }
      );
    }
  );
};

export const cancelled = (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const { cancelledRemark, enquiryStatus } = req.body;

  if (!cancelledRemark || !enquiryStatus) {
    return res.status(400).json({ message: "Please add remark!" });
  }

  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Enquiry ID" });
  }

  db.query(
    "SELECT * FROM enquirers WHERE enquirersid = ?",
    [Id],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      if (result.length === 0) {
        return res.status(404).json({ message: "Enquiry not found" });
      }

      const insertSQL = `
      INSERT INTO propertyfollowup (enquirerid, remark, status, updated_at, created_at)
      VALUES (?, ?, ?, ?, ?)`;

      db.query(
        insertSQL,
        [Id, cancelledRemark, enquiryStatus, currentdate, currentdate],
        (err, insertResult) => {
          if (err) {
            console.error("Error while Add Remark:", err);
            return res
              .status(500)
              .json({ message: "Database error", error: err });
          }

          res.status(201).json({
            message: "Remark added successfully",
            Id: insertResult.insertId,
          });
        }
      );
    }
  );
};

// * convert Into Digital Broker */
export const toDigitalBroker = (req, res) => {
  const userId = req.projectPartnerUser?.id;

  if (!userId) {
    return res.status(400).json({ message: "Invalid Project Partner Id" });
  }

  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Enquiry ID" });
  }

  // First, check if the enquiry exists
  db.query("SELECT * FROM enquirers WHERE enquirersid = ?", [Id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (result.length === 0) {
      return res.status(404).json({ message: "Enquiry not found" });
    }

    // Then, update the enquiry
    const updateSql = `
      UPDATE enquirers 
      SET salespersonid = NULL, territorypartnerid = NULL, projectpartnerid = NULL, 
          projectbroker = ? 
      WHERE enquirersid = ?
    `;

    db.query(updateSql, [userId, Id], (err, updateResult) => {
      if (err) {
        console.error("Error Converting Enquiry into Digital Broker:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      res.status(200).json({ message: "Enquiry convert into digital broker successfully" });
    });
  });
};
