import db from "../../config/dbconnect.js";
import moment from "moment";
import { sanitize } from "../../utils/sanitize.js";
import { uploadToS3 } from "../../utils/imageUpload.js";

// Fetch All Enquiries
export const getAll = (req, res) => {
  const userId = req.salesUser?.id;
  if (!userId) {
    return res
      .status(401)
      .json({ message: "Unauthorized Access, Please Login Again!" });
  }

  const enquirySource = req.params.source;
  if (!enquirySource) {
    return res.status(401).json({ message: "Enquiry Source Not Selected" });
  }

  let sql;
  let params = [userId, userId]; // for default query

  if (enquirySource === "Enquiry") {
    sql = `
      SELECT enquirers.*, properties.frontView, properties.seoSlug, properties.commissionAmount,
      territorypartner.fullname AS territoryName,
      territorypartner.contact AS territoryContact
      FROM enquirers 
      LEFT JOIN properties 
      ON enquirers.propertyid = properties.propertyid
      LEFT JOIN territorypartner ON territorypartner.id = enquirers.territorypartnerid 
      WHERE enquirers.status != 'Token' AND enquirers.salespersonid = ? 
      ORDER BY enquirers.enquirersid DESC`;
    params = [userId];
  } else if (enquirySource === "Digital Broker") {
    sql = `SELECT enquirers.*, properties.frontView, properties.seoSlug, properties.commissionAmount,
      territorypartner.fullname AS territoryName,
      territorypartner.contact AS territoryContact
      FROM enquirers 
      LEFT JOIN properties 
      ON enquirers.propertyid = properties.propertyid
      LEFT JOIN territorypartner ON territorypartner.id = enquirers.territorypartnerid 
      WHERE enquirers.status != 'Token' AND enquirers.salespersonid = ? 
      AND (enquirers.salesbroker IS NOT NULL OR enquirers.territorybroker IS NOT NULL OR enquirers.projectbroker IS NOT NULL)
      ORDER BY enquirers.enquirersid DESC`;
    params = [userId];
  } else {
    sql = `
      SELECT enquirers.*, properties.frontView, properties.seoSlug, properties.commissionAmount,
      territorypartner.fullname AS territoryName,
      territorypartner.contact AS territoryContact
      FROM enquirers 
      LEFT JOIN properties 
      ON enquirers.propertyid = properties.propertyid
      LEFT JOIN territorypartner ON territorypartner.id = enquirers.territorypartnerid 
      WHERE enquirers.status != 'Token' AND enquirers.salespersonid = ? OR enquirers.salesbroker = ?
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
  const salesUserId = req.salesUser?.id; // make sure this comes from auth middleware

  if (!salesUserId) {
    return res
      .status(401)
      .json({ message: "Unauthorized! Please Login Again." });
  }

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

  // Step 1: Fetch projectpartnerid of the logged-in salesperson
  const fetchSalesQuery =
    "SELECT projectpartnerid FROM salespersons WHERE salespersonsid = ?";

  db.query(fetchSalesQuery, [salesUserId], (err, salesResult) => {
    if (err) {
      console.error("Error fetching Salesperson:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (salesResult.length === 0) {
      return res.status(404).json({ message: "Salesperson not found" });
    }

    const projectpartnerid = salesResult[0].projectpartnerid;

    // Step 2: Build properties query
    let sql = `
      SELECT * FROM properties
      WHERE CAST(totalOfferPrice AS DECIMAL(15,2)) BETWEEN ? AND ?
        AND propertyCategory = ?
        AND state = ?
        AND city = ?
    `;
    const params = [minBudgetValue, maxBudgetValue, category, state, city];

    // If salesperson is linked to a projectpartner, filter properties by that partner
    if (projectpartnerid) {
      sql += " AND projectpartnerid = ?";
      params.push(projectpartnerid);
    }

    sql += " ORDER BY created_at DESC";

    // Step 3: Execute final query
    db.query(sql, params, (err, propertyResults) => {
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
          message: "No properties found based on your filters.",
        });
      }

      res.json({
        success: true,
        message: "Properties fetched successfully.",
        data: propertyResults,
      });
    });
  });
};

// **Fetch All Active Territory Partner**
export const getPropertyCity = (req, res) => {
  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Enquiry ID" });
  }

  const sql = `SELECT properties.city FROM enquirers 
               INNER JOIN properties 
               ON enquirers.propertyid = properties.propertyid
               WHERE enquirers.enquirersid = ? 
               ORDER BY enquirers.enquirersid DESC`;
  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res.json(result[0]);
  });
};

// Fetch All Active Territory Partner by Date
export const getTerritoryPartners = (req, res) => {
  const salesUserId = req.salesUser?.id;
  if (!salesUserId) {
    return res
      .status(401)
      .json({ message: "Unauthorized! Please Login Again." });
  }

  const propertyCity = req.params.city;
  const { selectedDate } = req.query; // e.g., '2025-09-12'

  // Step 1: Fetch projectpartnerid of the logged-in salesperson
  const fetchSalesQuery =
    "SELECT projectpartnerid FROM salespersons WHERE salespersonsid = ?";

  db.query(fetchSalesQuery, [salesUserId], (err, salesResult) => {
    if (err) {
      console.error("Error fetching Salesperson:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (salesResult.length === 0) {
      return res.status(404).json({ message: "Salesperson not found" });
    }

    const projectpartnerid = salesResult[0].projectpartnerid;

    // Step 2: Build TerritoryPartner query based on projectpartnerid availability
    let sql;
    let params;

    if (projectpartnerid) {
      // Filter by matching projectpartnerid
      sql = `
        SELECT * 
        FROM territorypartner
        WHERE status = 'Active'
        AND city = ?
        AND (
           inactive_until IS NULL 
           OR NOT JSON_CONTAINS(inactive_until, JSON_QUOTE(?))
        ) AND projectpartnerid = ?
        ORDER BY id DESC`;
      params = [propertyCity, selectedDate, projectpartnerid];
    } else {
      // No projectpartnerid linked — fetch all active ones in that city
      sql = `
        SELECT * 
        FROM territorypartner
        WHERE status = 'Active'
        AND city = ?
        AND (
           inactive_until IS NULL 
           OR NOT JSON_CONTAINS(inactive_until, JSON_QUOTE(?))
        )
        ORDER BY id DESC`;
      params = [propertyCity, selectedDate];
    }

    // Step 3: Execute final query
    db.query(sql, params, (err, result) => {
      if (err) {
        console.error("Error fetching Territory Partners:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      res.json(result);
    });
  });
};

// Assign Enquiry To Territory Partners
export const assignEnquiry = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const { territorypartnerid, territorypartnerdate, territorytimeslot } =
    req.body;
  if (!territorypartnerid || !territorypartnerdate || !territorytimeslot) {
    return res.status(400).json({ message: "All Fields Required" });
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

      db.query(
        "UPDATE enquirers SET territorypartnerid = ?, visitdate = ?, territorytimeslot = ?, updated_at = ?, created_at = ? WHERE enquirersid = ?",
        [
          territorypartnerid,
          territorypartnerdate,
          territorytimeslot,
          currentdate,
          currentdate,
          Id,
        ],
        (err, result) => {
          if (err) {
            console.error("Error assigning to territory partner :", err);
            return res
              .status(500)
              .json({ message: "Database error", error: err });
          }
          res.status(200).json({
            message: "Enquiry assigned successfully to Territory Partner",
          });
        },
      );
    },
  );
};

/* Change status */
export const status = (req, res) => {
  const { enquiryStatus } = req.body;
  if (enquiryStatus === "") {
    return res.status(400).json({ message: "Please Select Status!" });
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
        },
      );
    },
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
        },
      );
    },
  );
};

export const token = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const {
    paymenttype,
    tokenamount,
    remark,
    dealamount,
    enquiryStatus,
    propertyinfoid,
  } = req.body;

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

  try {
    // 1️⃣ Get Enquirer
    const enquirerResult = await new Promise((resolve, reject) => {
      db.query(
        "SELECT * FROM enquirers WHERE enquirersid = ?",
        [Id],
        (err, result) => (err ? reject(err) : resolve(result))
      );
    });

    if (enquirerResult.length === 0) {
      return res.status(404).json({ message: "Enquirer not found" });
    }

    const enquirer = enquirerResult[0];
    const propertyId = enquirer.propertyid;

    // 2️⃣ Get Property data
    const propertyResult = await new Promise((resolve, reject) => {
      db.query(
        "SELECT commissionType, commissionAmount, commissionPercentage FROM properties WHERE propertyid = ?",
        [propertyId],
        (err, result) => (err ? reject(err) : resolve(result))
      );
    });

    if (propertyResult.length === 0) {
      return res.status(404).json({ message: "Property not found" });
    }

    const property = propertyResult[0];
    let { commissionType, commissionAmount, commissionPercentage } = property;

    commissionType = commissionType || "";
    commissionPercentage = Number(commissionPercentage) || 0;
    let finalCommissionAmount = Number(commissionAmount) || 0;

    if (commissionType.toLowerCase() === "percentage") {
      finalCommissionAmount = (Number(dealamount) * commissionPercentage) / 100;
    }

    // Split commission
    const reparvCommission = (finalCommissionAmount * 40) / 100;
    const salesCommission = (finalCommissionAmount * 40) / 100;
    const territoryCommission = (finalCommissionAmount * 20) / 100;

    // 3️⃣ Upload image to S3 (if exists)
    let paymentImage = null;
    if (req.file) {
      paymentImage = await uploadToS3(req.file); // uses your existing helper
    }

    // 4️⃣ Insert into propertyfollowup
    const insertSQL = `
      INSERT INTO propertyfollowup (
        enquirerid, paymenttype, tokenamount, remark, dealamount, status, propertyinfoid,
        totalcommission, reparvcommission, salescommission, territorycommission, paymentimage,
        updated_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const insertResult = await new Promise((resolve, reject) => {
      db.query(
        insertSQL,
        [
          Id,
          paymenttype,
          tokenamount,
          remark,
          dealamount,
          enquiryStatus,
          propertyId || null,
          finalCommissionAmount,
          reparvCommission,
          salesCommission,
          territoryCommission,
          paymentImage,
          currentdate,
          currentdate,
        ],
        (err, result) => (err ? reject(err) : resolve(result))
      );
    });

    return res.status(201).json({
      message: "Token added successfully",
      followupId: insertResult.insertId,
      commissionBreakdown: {
        totalCommission: finalCommissionAmount,
        salesCommission,
        reparvCommission,
        territoryCommission,
      },
      paymentImage, // S3 URL
    });
  } catch (error) {
    console.error("Error in token function:", error);
    return res.status(500).json({ message: "Server error", error });
  }
};


export const followUpOld = (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const { followUpRemark, enquiryStatus } = req.body;

  if (!followUpRemark || !enquiryStatus) {
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
        [Id, followUpRemark, enquiryStatus, currentdate, currentdate],
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
        },
      );
    },
  );
};

export const followUp = (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const { visitDate, followUpRemark, enquiryStatus } = req.body;

  //console.log(visitDate, "ss");

  if (!followUpRemark || !enquiryStatus) {
    return res.status(400).json({ message: "Please add remark and status!" });
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
        INSERT INTO propertyfollowup (enquirerid, visitdate, remark, status, updated_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `;

      db.query(
        insertSQL,
        [
          Id,
          sanitize(formattedVisitDate),
          followUpRemark,
          enquiryStatus,
          currentdate,
          currentdate,
        ],
        (err, insertResult) => {
          if (err) {
            console.error("Error inserting follow-up:", err);
            return res
              .status(500)
              .json({ message: "Database error", error: err });
          }

          res.status(201).json({
            message: "Follow Up added successfully",
            Id: insertResult.insertId,
            visitDate: visitDate || null,
          });
        },
      );
    },
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
        },
      );
    },
  );
};

//Filters for Enquiry
export const getByStatus = (req, res) => {
  const status = req.params.id;
  const sql = `SELECT * FROM enquirers WHERE status = ? `;

  db.query(sql, [status], (err, results) => {
    if (err) {
      console.error("Error fetching new enquiries:", err);
      return res.status(500).json({ error: "Database error" });
    }

    res.json(results); // Send the list of enquiries with status
  });
};

export const getAvailableTPsForDate = (req, res) => {
  const propertyCity = req.params.city;
  const { selectedDate } = req.query; // e.g., '2025-09-12'

  const sql = `
    SELECT * 
    FROM territorypartner
    WHERE status = 'Active'
      AND city = ?
      AND (
        inactive_until IS NULL 
        OR NOT JSON_CONTAINS(inactive_until, JSON_QUOTE(?))
      )
    ORDER BY id DESC
  `;

  db.query(sql, [propertyCity, selectedDate], (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res.json(result);
  });
};
