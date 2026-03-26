import axios from "axios";
import db from "../../config/dbconnect.js";
import moment from "moment-timezone";

export const getAll = (req, res) => {
  try {
    const enquirySource = req.params.source;
    const partnerId = req.projectPartnerUser?.id || req.params?.id; // Project Partner Logic

    let sql;
    let params = [];

    // Base conditions applied to all
    let baseCondition = `enquirers.status != 'Token'`;

    // Add partner logic only if partnerId exists
    if (partnerId) {
      baseCondition += ` AND properties.projectpartnerid = ?`;
      params.push(partnerId);
    }

    // Source-wise filters
    if (enquirySource === "Onsite") {
      sql = `
        SELECT enquirers.*, properties.frontView, properties.seoSlug, properties.commissionAmount,
               territorypartner.fullname AS territoryName, territorypartner.contact AS territoryContact
        FROM enquirers 
        LEFT JOIN properties ON enquirers.propertyid = properties.propertyid
        LEFT JOIN territorypartner ON territorypartner.id = enquirers.territorypartnerid
        WHERE ${baseCondition}
          AND properties.status = 'active'
          AND properties.approve = 'Approved'
          AND enquirers.source = 'Onsite'
        ORDER BY enquirers.enquirersid DESC`;
    } else if (enquirySource === "Direct") {
      sql = `
        SELECT enquirers.*, properties.frontView, properties.seoSlug, properties.commissionAmount,
               territorypartner.fullname AS territoryName, territorypartner.contact AS territoryContact
        FROM enquirers 
        LEFT JOIN properties ON enquirers.propertyid = properties.propertyid
        LEFT JOIN territorypartner ON territorypartner.id = enquirers.territorypartnerid
        WHERE ${baseCondition}
          AND enquirers.source = 'Direct'
        ORDER BY enquirers.enquirersid DESC`;
    } else if (enquirySource === "CSV") {
      sql = `
        SELECT enquirers.*, properties.frontView, properties.seoSlug, properties.commissionAmount,
               territorypartner.fullname AS territoryName, territorypartner.contact AS territoryContact
        FROM enquirers 
        LEFT JOIN properties ON enquirers.propertyid = properties.propertyid
        LEFT JOIN territorypartner ON territorypartner.id = enquirers.territorypartnerid
        WHERE ${baseCondition}
          AND enquirers.source = 'CSV File'
        ORDER BY enquirers.enquirersid DESC`;
    } else {
      sql = `
        SELECT enquirers.*, properties.frontView, properties.seoSlug, properties.commissionAmount,
               territorypartner.fullname AS territoryName, territorypartner.contact AS territoryContact
        FROM enquirers 
        LEFT JOIN properties ON enquirers.propertyid = properties.propertyid
        LEFT JOIN territorypartner ON territorypartner.id = enquirers.territorypartnerid
        WHERE ${baseCondition}
        ORDER BY enquirers.enquirersid DESC`;
    }

    // Execute the query
    db.query(sql, params, (err, result) => {
      if (err) {
        console.error("Error fetching Enquirers:", err);
        return res
          .status(500)
          .json({ success: false, message: "Database error", error: err });
      }

      // Format dates
      const formatted = result.map((row) => ({
        ...row,
        created_at: row.created_at
          ? moment
              .utc(row.created_at)
              .tz("Asia/Kolkata")
              .format("DD MMM YYYY | hh:mm A")
          : null,
        updated_at: row.updated_at
          ? moment
              .utc(row.updated_at)
              .tz("Asia/Kolkata")
              .format("DD MMM YYYY | hh:mm A")
          : null,
      }));

      res.status(200).json({
        success: true,
        message: "Enquiries fetched successfully",
        totalEnquiries: formatted.length,
        data: formatted,
      });
    });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const getPartnersEnquiry = (req, res) => {
  const Id = req.params.id;
  if (!Id) {
    console.log("Invalid User Id:", Id);
    return res.status(400).json({ message: "Invalid User Id" });
  }
  const source = req.params.source;

  const sql = `
  SELECT 
    enquirers.*, 
    properties.frontView, 
    properties.seoSlug, 
    properties.commissionAmount,
    territorypartner.fullname AS territoryName,
    territorypartner.contact AS territoryContact,
    salespersons.projectpartnerid AS salespersonProjectPartnerId,
    territorypartner.projectpartnerid AS territoryProjectPartnerId
  FROM enquirers 
  LEFT JOIN properties 
    ON enquirers.propertyid = properties.propertyid
  LEFT JOIN territorypartner 
    ON territorypartner.id = enquirers.territorypartnerid 
  LEFT JOIN salespersons
    ON salespersons.salespersonsid = enquirers.salespersonid 
  WHERE 
   enquirers.source = ? AND 
     (
      salespersons.projectpartnerid = ? 
      OR territorypartner.projectpartnerid = ?
    )
  ORDER BY enquirers.enquirersid DESC
`;

  db.query(sql, [source, Id, Id], (err, results) => {
    if (err) {
      console.error("Database Query Error:", err);
      return res.status(500).json({
        message: "Database query error",
        error: err,
      });
    }

    const formatted = results.map((row) => ({
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

export const assignEnquiry = async (req, res) => {
  const {
    salespersonid,
    salesperson,
    salespersoncontact,
    notes,
    followUpDate,
  } = req.body;
  console.log(req.body);

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
        "UPDATE enquirers SET salespersonid = ?, assign = ?,notes = ?,  updated_at = ? WHERE enquirersid = ?",
        [salespersonid, salesInfo, notes, currentDate, Id],
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
        },
      );
    },
  );
};
// Assign Enquiry To Territory Partners
export const assignEnquiryToTerritoryPartner = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const { territorypartnerid } = req.body;
  if (!territorypartnerid) {
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
        "UPDATE enquirers SET territorypartnerid = ?,  updated_at = ?, created_at = ? WHERE enquirersid = ?",
        [territorypartnerid, currentdate, currentdate, Id],
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

//old join
export const addEnquiry = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const Id = req.body.projectpartnerid;
  console.log(req.body);

  if (!Id) {
    return res.status(400).json({ message: "Invalid Id" });
  }

  const {
    propertyid,
    customer,
    contact,
    minbudget,
    maxbudget,
    category,
    state,
    city,
    location,
    message,
  } = req.body;

  // Validate required fields
  if (
    !customer ||
    !contact ||
    !minbudget ||
    !maxbudget ||
    !category ||
    !state ||
    !city ||
    !location ||
    !message
  ) {
    return res.status(400).json({ message: "All fields are required" });
  }

  let insertSQL;
  let insertData;

  // Case 1: Enquiry with Property ID
  if (propertyid) {
    insertSQL = `
      INSERT INTO enquirers (
        projectpartner,
        customer,
        contact,
        minbudget,
        maxbudget,
        category,
        state,
        city,
        location,
        propertyid,
        message,
        source,
        updated_at,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    insertData = [
      Id,
      customer,
      contact,
      minbudget,
      maxbudget,
      category,
      state,
      city,
      location,
      propertyid,
      message,
      "Direct",
      currentdate,
      currentdate,
    ];
  }

  // Case 2: Enquiry without Property ID
  else {
    insertSQL = `
      INSERT INTO enquirers (
        projectbroker,
        projectpartner,
        customer,
        contact,
        minbudget,
        maxbudget,
        category,
        state,
        city,
        location,
        message,
        source,
        updated_at,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    insertData = [
      Id, // projectbroker
      Id, // projectpartner
      customer,
      contact,
      minbudget,
      maxbudget,
      category,
      state,
      city,
      location,
      message,
      "Direct",
      currentdate,
      currentdate,
    ];
  }

  db.query(insertSQL, insertData, (err, result) => {
    if (err) {
      console.error("Error inserting enquiry:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    res.status(201).json({
      message: "Enquiry added successfully",
      enquiryId: result.insertId,
    });
  });
};

export const getAllCreatedEnquiry = (req, res) => {
  const projectpartnerid = req.params.id;
  if (!projectpartnerid) {
    return res.status(400).json({ message: "Partner ID is required" });
  }

  const sql = `
    SELECT enquirers.*, 
           properties.frontView, 
           properties.seoSlug, 
           properties.commissionAmount,
           territorypartner.fullname AS territoryName,
           territorypartner.contact AS territoryContact
    FROM enquirers
    LEFT JOIN properties 
      ON enquirers.propertyid = properties.propertyid
    LEFT JOIN territorypartner 
      ON territorypartner.id = enquirers.territorypartnerid
    WHERE enquirers.projectpartnerid = ?
    ORDER BY enquirers.enquirersid DESC`;

  db.query(sql, [projectpartnerid], (err, results) => {
    if (err) {
      console.error("Database Query Error:", err);
      return res
        .status(500)
        .json({ message: "Database query error", error: err });
    }

    const formatted = results.map((row) => ({
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

    res.json({ data: formatted });
  });
};

//**Change status */
export const status = (req, res) => {
  const Id = parseInt(req.params.id);

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid enquirers  ID" });
  }

  db.query(
    "SELECT * FROM enquirers WHERE enquirersid= ?",
    [Id],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      let status = "";
      if (result[0].digitalbroker === "Active") {
        status = "Inactive";
      } else {
        status = "Active";
      }
      console.log(status);
      db.query(
        "UPDATE enquirers SET digitalbroker = ? WHERE  enquirersid= ? ",
        [status, Id],
        (err, result) => {
          if (err) {
            console.error("Error deleting :", err);
            return res
              .status(500)
              .json({ message: "Database error", error: err });
          }
          res.status(200).json({
            message:
              status === "Active"
                ? "Enquiry Assign successfully"
                : "Change Assign Status  successfully",
          });
        },
      );
    },
  );
};

export const assignToReparv = (req, res) => {
  const userId = req.params.id;

  if (!userId) {
    return res.status(400).json({ message: "Invalid Project Partner Id" });
  }

  const Id = parseInt(req.params.enquiryid);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Enquiry ID" });
  }
  console.log(Id);

  // First, check if the enquiry exists
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

      // Then, update the enquiry
      const updateSql = `
      UPDATE enquirers 
      SET salespersonid=null,territorypartnerid=null, projectbroker = ? 
      WHERE enquirersid = ?
    `;

      db.query(updateSql, [userId, Id], (err, updateResult) => {
        if (err) {
          console.error("Error Assigning Enquiry to Reparv:", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }

        res
          .status(200)
          .json({ message: "Enquiry assigned to Reparv successfully" });
      });
    },
  );
};

// export const getAllDigitalEnquiry = (req, res) => {
//   const projectpartnerid = req.params.id;
// if (!projectpartnerid) {
//     return res
//       .status(400)
//       .json({ message: "Partner ID is required" });
//   }

//    const sql = `
//     SELECT enquirers.*,
//            properties.frontView,
//            properties.seoSlug,
//            properties.commissionAmount,
//            territorypartner.fullname AS territoryName,
//            territorypartner.contact AS territoryContact
//     FROM enquirers
//     LEFT JOIN properties
//       ON enquirers.propertyid = properties.propertyid
//     LEFT JOIN territorypartner
//       ON territorypartner.id = enquirers.territorypartnerid
//     WHERE enquirers.projectpartner = ?
//     ORDER BY enquirers.enquirersid DESC`;

//   db.query(sql, [projectpartnerid], (err, results) => {
//     if (err) {
//       console.error("Database Query Error:", err);
//       return res
//         .status(500)
//         .json({ message: "Database query error", error: err });
//     }

//     const formatted = results.map((row) => ({
//       ...row,
//       created_at: moment.utc(row.created_at).tz("Asia/Kolkata").format("DD MMM YYYY | hh:mm A"),
//       updated_at: moment.utc(row.updated_at).tz("Asia/Kolkata").format("DD MMM YYYY | hh:mm A"),
//     }));

//     res.json( {data: formatted});
//   });
// };

export const getAllDigitalEnquiry = (req, res) => {
  const projectpartnerid = req.params.id;

  if (!projectpartnerid) {
    return res.status(400).json({ message: "Partner ID is required" });
  }

  const sql = `
    SELECT DISTINCT enquirers.*,
           properties.frontView, 
           properties.seoSlug, 
           properties.commissionAmount,
           territorypartner.fullname AS territoryName,
           territorypartner.contact AS territoryContact
    FROM enquirers
    LEFT JOIN properties 
      ON enquirers.propertyid = properties.propertyid
    LEFT JOIN territorypartner 
      ON (
        territorypartner.id = enquirers.territorypartnerid 
        OR territorypartner.id = enquirers.territorybroker
      )
    LEFT JOIN salespersons
      ON enquirers.salespartner = salespersons.salespersonsid
    WHERE enquirers.projectbroker = ?
       OR salespersons.projectpartnerid = ?
       OR territorypartner.projectpartnerid = ?
    ORDER BY enquirers.enquirersid DESC
  `;

  db.query(
    sql,
    [projectpartnerid, projectpartnerid, projectpartnerid],
    (err, results) => {
      if (err) {
        console.error("Database Query Error:", err);
        return res
          .status(500)
          .json({ message: "Database query error", error: err });
      }

      const formatted = results.map((row) => ({
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

      res.json({ data: formatted });
    },
  );
};

//get remark
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
      visitdate: row.visitdate,
    }));

    res.json(formatted);
  });
};

//Create Enquiry New
export const createEnquiry = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");

  const {
    fullName,
    contactNumber,
    leadSource,
    preferredContactMethod,
    minBudget,
    maxBudget,
    propertyCategory,
    preferredBHK,
    state,
    city,
    preferredLocation,
    nearbyLandmark,
    message,
    leadPriority,
    followUpDate,
    selectedProperty,
    projectpartnerid,
  } = req.body;

  console.log(req.body);

  /* ── validate ── */
  if (!projectpartnerid) {
    return res.status(400).json({ message: "Invalid project partner ID" });
  }

  if (
    !fullName ||
    !contactNumber ||
    !minBudget ||
    !maxBudget ||
    !propertyCategory ||
    !state ||
    !city ||
    !preferredLocation ||
    !message
  ) {
    return res.status(400).json({ message: "All fields are required" });
  }

  /* ── pack extra fields into notes ── */
  const notes =
    [
      preferredContactMethod && `Preferred Contact: ${preferredContactMethod}`,
      preferredBHK && `BHK: ${preferredBHK}`,
      nearbyLandmark && `Landmark: ${nearbyLandmark}`,
      leadPriority && `Priority: ${leadPriority}`,
      followUpDate && `Follow-up: ${followUpDate}`,
    ]
      .filter(Boolean)
      .join(" | ") || null;

  const finalPropertyId = selectedProperty?.propertyid || null;

  let insertSQL;
  let insertData;

  /* ── Case 1: with property ── */
  if (finalPropertyId) {
    insertSQL = `
      INSERT INTO enquirers (
        projectpartner,
        customer,
        contact,
        minbudget,
        maxbudget,
        category,
        state,
        city,
        location,
        propertyid,
        message,
        source,
        notes,
        updated_at,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    insertData = [
      projectpartnerid,
      fullName,
      contactNumber,
      minBudget,
      maxBudget,
      propertyCategory,
      state,
      city,
      preferredLocation,
      finalPropertyId,
      message,
      leadSource || "Direct",
      notes,
      currentdate,
      currentdate,
    ];
  } else {
    /* ── Case 2: without property ── */
    insertSQL = `
      INSERT INTO enquirers (
        projectbroker,
        projectpartner,
        customer,
        contact,
        minbudget,
        maxbudget,
        category,
        state,
        city,
        location,
        message,
        source,
        notes,
        updated_at,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    insertData = [
      projectpartnerid, // projectbroker
      projectpartnerid, // projectpartner
      fullName,
      contactNumber,
      minBudget,
      maxBudget,
      propertyCategory,
      state,
      city,
      preferredLocation,
      message,
      leadSource || "Direct",
      notes,
      currentdate,
      currentdate,
    ];
  }

  db.query(insertSQL, insertData, (err, result) => {
    if (err) {
      console.error("Error inserting enquiry:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    res.status(201).json({
      message: "Enquiry added successfully",
      enquiryId: result.insertId,
    });
  });
};

//Meta LEads Info
export const getAllLeads = (req, res) => {
  const propertyid = req.params.id;
  const sql = `
    SELECT *
    FROM meta_leads
    Where id=?
    ORDER BY created_time DESC
  `;

  db.query(sql, [propertyid], (err, results) => {
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
        ? moment
            .utc(row.created_at)
            .tz("Asia/Kolkata")
            .format("DD MMM YYYY | hh:mm A")
        : null,
      updated_at: row.updated_at
        ? moment
            .utc(row.updated_at)
            .tz("Asia/Kolkata")
            .format("DD MMM YYYY | hh:mm A")
        : null,
    }));

    res.json({
      success: true,
      data: formatted,
    });
  });
};
