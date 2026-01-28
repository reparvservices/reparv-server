import axios from "axios";
import db from "../../config/dbconnect.js";
import moment from "moment";
import { sanitize } from "../../utils/sanitize.js";
import { uploadToS3 } from "../../utils/imageUpload.js";

// * Fetch All Enquiries
export const getAll = (req, res) => {
  const enquirySource = req.params.source;

  if (!enquirySource) {
    return res.status(400).json({ message: "Enquiry Source Not Selected" });
  }

  let sql;

  // 1. ON-SITE ENQUIRIES (from website)
  if (enquirySource === "Onsite") {
    sql = `
      SELECT 
        enquirers.*, 
        properties.frontView, 
        properties.seoSlug, 
        properties.commissionAmount,
        territorypartner.fullname AS territoryName, 
        territorypartner.contact AS territoryContact,
        projectpartner.fullname AS projectPartnerName, 
        projectpartner.contact AS projectPartnerContact
      FROM enquirers 
      LEFT JOIN properties ON enquirers.propertyid = properties.propertyid
      LEFT JOIN territorypartner ON territorypartner.id = enquirers.territorypartnerid
      LEFT JOIN projectpartner ON projectpartner.id = enquirers.projectpartnerid
      WHERE properties.status = 'active' 
        AND properties.approve = 'Approved' 
        AND enquirers.source = 'Onsite' 
        AND enquirers.status != 'Token'
      ORDER BY enquirers.enquirersid DESC
    `;
  }

  // 2. DIRECT ENQUIRIES (from partners)
  else if (enquirySource === "Direct") {
    sql = `
      SELECT 
        enquirers.*, 
        properties.frontView, 
        properties.seoSlug, 
        properties.commissionAmount,

        -- Territory Partner Details
        territorypartner.fullname AS territoryName, 
        territorypartner.contact AS territoryContact,

        -- Project Partner Details
        projectpartner.fullname AS projectPartnerName, 
        projectpartner.contact AS projectPartnerContact,

        -- Lister Details (based on which ID exists)
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

      -- Dynamic lister joins
      LEFT JOIN salespersons ON enquirers.salespartner = salespersons.salespersonsid
      LEFT JOIN territorypartner AS territoryLister ON enquirers.territorypartner = territoryLister.id
      LEFT JOIN projectpartner AS projectLister ON enquirers.projectpartner = projectLister.id

      WHERE enquirers.source = 'Direct'
        AND enquirers.status != 'Token'
      ORDER BY enquirers.enquirersid DESC
    `;
  }

  // 3. CSV IMPORTED ENQUIRIES
  else if (enquirySource === "CSV") {
    sql = `
      SELECT 
        enquirers.*, 
        properties.frontView, 
        properties.seoSlug, 
        properties.commissionAmount,
        territorypartner.fullname AS territoryName, 
        territorypartner.contact AS territoryContact,
        projectpartner.fullname AS projectPartnerName, 
        projectpartner.contact AS projectPartnerContact
      FROM enquirers 
      LEFT JOIN properties ON enquirers.propertyid = properties.propertyid
      LEFT JOIN territorypartner ON territorypartner.id = enquirers.territorypartnerid
      LEFT JOIN projectpartner ON projectpartner.id = enquirers.projectpartnerid
      WHERE enquirers.source = 'CSV File' 
        AND enquirers.status != 'Token'
      ORDER BY enquirers.enquirersid DESC
    `;
  }

  // 4. Ads ENQUIRIES (from google sheet)
  else if (enquirySource === "Ads") {
    sql = `
      SELECT 
        enquirers.*, 
        properties.frontView, 
        properties.seoSlug, 
        properties.commissionAmount,
        territorypartner.fullname AS territoryName, 
        territorypartner.contact AS territoryContact,
        projectpartner.fullname AS projectPartnerName, 
        projectpartner.contact AS projectPartnerContact
      FROM enquirers 
      LEFT JOIN properties ON enquirers.propertyid = properties.propertyid
      LEFT JOIN territorypartner ON territorypartner.id = enquirers.territorypartnerid
      LEFT JOIN projectpartner ON projectpartner.id = enquirers.projectpartnerid
      WHERE enquirers.source = 'Ads' 
        AND enquirers.status != 'Token'
      ORDER BY enquirers.enquirersid DESC
    `;
  }

  // 5. Project Partner Landing Page ENQUIRIES (from website)
  else if (enquirySource === "Landing Page") {
    sql = `
      SELECT 
        enquirers.*, 
        properties.frontView, 
        properties.seoSlug, 
        properties.commissionAmount,
        territorypartner.fullname AS territoryName, 
        territorypartner.contact AS territoryContact,
        projectpartner.fullname AS projectPartnerName, 
        projectpartner.contact AS projectPartnerContact
      FROM enquirers 
      LEFT JOIN properties ON enquirers.propertyid = properties.propertyid
      LEFT JOIN territorypartner ON territorypartner.id = enquirers.territorypartnerid
      LEFT JOIN projectpartner ON projectpartner.id = enquirers.projectpartnerid
      WHERE properties.status = 'active' 
        AND properties.approve = 'Approved' 
        AND enquirers.source = 'Landing Page'
        AND enquirers.status != 'Token'
      ORDER BY enquirers.enquirersid DESC
    `;
  }

  // 6. OTHER SOURCES (default)
  else {
    sql = `
      SELECT 
        enquirers.*, 
        properties.frontView, 
        properties.seoSlug, 
        properties.commissionAmount,
        territorypartner.fullname AS territoryName, 
        territorypartner.contact AS territoryContact,
        projectpartner.fullname AS projectPartnerName, 
        projectpartner.contact AS projectPartnerContact
      FROM enquirers 
      LEFT JOIN properties ON enquirers.propertyid = properties.propertyid
      LEFT JOIN territorypartner ON territorypartner.id = enquirers.territorypartnerid
      LEFT JOIN projectpartner ON projectpartner.id = enquirers.projectpartnerid
      WHERE enquirers.status != 'Token'
      ORDER BY enquirers.enquirersid DESC
    `;
  }

  // Execute Query
  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching Enquirers:", err);
      return res.status(500).json({
        success: false,
        message: "Database error",
        error: err,
      });
    }

    // Format Dates
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

// * Fetch All Digital Broker Enquiries
export const getAllDigitalBroker = (req, res) => {
  const digitalBroker = req.params.broker;
  if (!digitalBroker) {
    return res.status(401).json({ message: "Digital Broker Not Selected" });
  }

  let sql;

  if (digitalBroker === "Sales Partner") {
    sql = `
      SELECT enquirers.*, properties.frontView, properties.seoSlug, properties.commissionAmount,
             territorypartner.fullname AS territoryName, 
             territorypartner.contact AS territoryContact,
             projectpartner.fullname AS projectPartnerName, 
             projectpartner.contact AS projectPartnerContact,
             db.fullname AS dbName, 
             db.contact AS dbContact
      FROM enquirers 
      LEFT JOIN properties ON enquirers.propertyid = properties.propertyid
      LEFT JOIN territorypartner ON territorypartner.id = enquirers.territorypartnerid
      LEFT JOIN projectpartner ON projectpartner.id = enquirers.projectpartnerid
      LEFT JOIN salespersons db ON db.salespersonsid = enquirers.salesbroker
      WHERE properties.status = 'active' 
        AND properties.approve = 'Approved' 
        AND enquirers.source = 'Onsite' 
        AND enquirers.status != 'Token'
        AND enquirers.salesBroker IS NOT NULL
      ORDER BY enquirers.enquirersid DESC`;
  } else if (digitalBroker === "Project Partner") {
    sql = `
      SELECT enquirers.*, properties.frontView, properties.seoSlug, properties.commissionAmount,
             territorypartner.fullname AS territoryName, 
             territorypartner.contact AS territoryContact,
             projectpartner.fullname AS projectPartnerName, 
             projectpartner.contact AS projectPartnerContact,
             db.fullname AS dbName,
             db.contact AS dbContact
      FROM enquirers 
      LEFT JOIN properties ON enquirers.propertyid = properties.propertyid
      LEFT JOIN territorypartner ON territorypartner.id = enquirers.territorypartnerid
      LEFT JOIN projectpartner ON projectpartner.id = enquirers.projectpartnerid
      LEFT JOIN projectpartner db ON db.id = enquirers.projectbroker
      WHERE enquirers.source = 'Direct' 
        AND enquirers.status != 'Token'
        AND enquirers.projectBroker IS NOT NULL
      ORDER BY enquirers.enquirersid DESC`;
  } else if (digitalBroker === "Territory Partner") {
    sql = `
      SELECT enquirers.*, properties.frontView, properties.seoSlug, properties.commissionAmount,
             territorypartner.fullname AS territoryName, 
             territorypartner.contact AS territoryContact,
             projectpartner.fullname AS projectPartnerName, 
             projectpartner.contact AS projectPartnerContact,
             db.fullname AS dbName, 
             db.contact AS dbContact
      FROM enquirers 
      LEFT JOIN properties ON enquirers.propertyid = properties.propertyid
      LEFT JOIN territorypartner ON territorypartner.id = enquirers.territorypartnerid
      LEFT JOIN projectpartner ON projectpartner.id = enquirers.projectpartnerid
      LEFT JOIN territorypartner db ON db.id = enquirers.territorybroker
      WHERE enquirers.source = 'CSV File' 
        AND enquirers.status != 'Token'
        AND enquirers.territoryBroker IS NOT NULL
      ORDER BY enquirers.enquirersid DESC`;
  } else {
    sql = `
      SELECT enquirers.*, properties.frontView, properties.seoSlug, properties.commissionAmount,
             territorypartner.fullname AS territoryName, 
             territorypartner.contact AS territoryContact,
             projectpartner.fullname AS projectPartnerName, 
             projectpartner.contact AS projectPartnerContact
      FROM enquirers 
      LEFT JOIN properties ON enquirers.propertyid = properties.propertyid  
      LEFT JOIN territorypartner ON territorypartner.id = enquirers.territorypartnerid
      LEFT JOIN projectpartner ON projectpartner.id = enquirers.projectpartnerid
      WHERE enquirers.status != 'Token'
        AND (
          enquirers.salesbroker IS NOT NULL 
          OR enquirers.projectbroker IS NOT NULL 
          OR enquirers.territorybroker IS NOT NULL
        )
      ORDER BY enquirers.enquirersid DESC`;
  }

  db.query(sql, (err, result) => {
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

// **Fetch Single by ID**
export const getById = (req, res) => {
  const Id = parseInt(req.params.id);
  const sql = `SELECT enquirers.*, 
       territorypartner.fullname AS territoryName,
       territorypartner.contact AS territoryContact,
       territoryenquiry.followup AS territoryFollowUp,
       territoryenquiry.status AS territoryStatus,
       projectpartner.fullname AS projectPartnerName, 
                projectpartner.contact AS projectPartnerContact
       FROM enquirers 
       LEFT JOIN territorypartner ON territorypartner.id = enquirers.territorypartnerid 
       LEFT JOIN territoryenquiry ON territoryenquiry.enquirerid = enquirers.enquirersid
       LEFT JOIN projectpartner ON projectpartner.id = enquirers.projectpartnerid
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
    ORDER BY created_at DESC
  `;

  db.query(
    propertySql,
    [minBudgetValue, maxBudgetValue, category, state, city],
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
      ORDER BY created_at DESC
    `;

    db.query(
      propertySql,
      [minbudget, maxbudget, category, state, city],
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

export const token = async (req, res) => {
  try {
    const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
    const { paymenttype, tokenamount, remark, dealamount, enquiryStatus } =
      req.body;

    if (
      !paymenttype ||
      !tokenamount ||
      !remark ||
      !dealamount ||
      !enquiryStatus
    ) {
      return res
        .status(400)
        .json({ message: "Please add all required fields!" });
    }

    const Id = parseInt(req.params.id);
    if (isNaN(Id)) {
      return res.status(400).json({ message: "Invalid Enquiry ID" });
    }

    /* Upload payment image to S3 */
    let paymentImage = null;
    if (req.file) {
      paymentImage = await uploadToS3(req.file,);
    }

    // Step 1: Get Enquirer
    const [enquirerResult] = await db
      .promise()
      .query("SELECT propertyid FROM enquirers WHERE enquirersid = ?", [Id]);

    if (enquirerResult.length === 0) {
      return res.status(404).json({ message: "Enquirer not found" });
    }

    const propertyId = enquirerResult[0].propertyid;

    // Step 2: Get Property commission data
    const [propertyResult] = await db.promise().query(
      `SELECT commissionType, commissionAmount, commissionPercentage
         FROM properties WHERE propertyid = ?`,
      [propertyId]
    );

    if (propertyResult.length === 0) {
      return res.status(404).json({ message: "Property not found" });
    }

    let { commissionType, commissionAmount, commissionPercentage } =
      propertyResult[0];

    commissionType = commissionType || "";
    commissionPercentage = Number(commissionPercentage) || 0;
    let finalCommissionAmount = Number(commissionAmount) || 0;

    // Percentage-based commission
    if (commissionType.toLowerCase() === "percentage") {
      finalCommissionAmount = (Number(dealamount) * commissionPercentage) / 100;
    }

    // Commission split
    const reparvCommission = (finalCommissionAmount * 40) / 100;

    const grossSalesCommission = (finalCommissionAmount * 40) / 100;
    const salesCommission =
      grossSalesCommission - (grossSalesCommission * 2) / 100;

    const grossTerritoryCommission = (finalCommissionAmount * 20) / 100;
    const territoryCommission =
      grossTerritoryCommission - (grossTerritoryCommission * 2) / 100;

    const TDS =
      (grossSalesCommission * 2) / 100 + (grossTerritoryCommission * 2) / 100;

    // Step 3: Insert propertyfollowup
    const insertSQL = `
      INSERT INTO propertyfollowup (
        enquirerid,
        paymenttype,
        tokenamount,
        remark,
        dealamount,
        status,
        totalcommission,
        reparvcommission,
        salescommission,
        territorycommission,
        tds,
        paymentimage,
        updated_at,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [insertResult] = await db
      .promise()
      .query(insertSQL, [
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
        paymentImage,
        currentdate,
        currentdate,
      ]);

    return res.status(201).json({
      message: "Token added successfully",
      followupId: insertResult.insertId,
      paymentImage,
      commissionBreakdown: {
        totalCommission: finalCommissionAmount,
        salesCommission,
        reparvCommission,
        territoryCommission,
      },
    });
  } catch (error) {
    console.error("Token insert error:", error);
    return res.status(500).json({
      message: "Server error",
      error,
    });
  }
};

export const newToken = (req, res) => {
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
          let projectCommission;
          let salesCommission;
          let territoryCommission;
          let TDS;
          if (enquirer?.salesbroker) {
            const grossProjectCommission = (finalCommissionAmount * 20) / 100;
            projectCommission =
              grossProjectCommission - (grossProjectCommission * 2) / 100;

            const grossSalesCommission = (finalCommissionAmount * 40) / 100;
            salesCommission =
              grossSalesCommission - (grossSalesCommission * 2) / 100;

            const grossTerritoryCommission = 0;
            territoryCommission = 0;

            TDS =
              (grossProjectCommission * 2) / 100 +
              (grossSalesCommission * 2) / 100 +
              (grossTerritoryCommission * 2) / 100;
          } else if (enquirer?.territorybroker) {
            const grossProjectCommission = (finalCommissionAmount * 40) / 100;
            projectCommission =
              grossProjectCommission - (grossProjectCommission * 2) / 100;

            const grossSalesCommission = 0;
            salesCommission = 0;

            const grossTerritoryCommission = (finalCommissionAmount * 20) / 100;
            territoryCommission =
              grossTerritoryCommission - (grossTerritoryCommission * 2) / 100;

            TDS =
              (grossProjectCommission * 2) / 100 +
              (grossSalesCommission * 2) / 100;
          } else {
            const grossProjectCommission = 0;
            projectCommission = 0;

            const grossSalesCommission = (finalCommissionAmount * 40) / 100;
            salesCommission =
              grossSalesCommission - (grossSalesCommission * 2) / 100;

            const grossTerritoryCommission = (finalCommissionAmount * 20) / 100;
            territoryCommission =
              grossTerritoryCommission - (grossTerritoryCommission * 2) / 100;

            TDS =
              (grossSalesCommission * 2) / 100 +
              (grossTerritoryCommission * 2) / 100;
          }

          // Step 3: Insert into propertyfollowup
          const insertSQL = `
          INSERT INTO propertyfollowup (
            enquirerid, paymenttype, tokenamount, remark, dealamount, status, 
            totalcommission, reparvcommission, projectcommission, salescommission, territorycommission, tds, paymentimage,
            updated_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
              projectCommission,
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
                  reparvCommission,
                  projectCommission,
                  salesCommission,
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
