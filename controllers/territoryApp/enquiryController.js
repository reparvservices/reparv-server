import db from "../../config/dbconnect.js";
import moment from "moment-timezone";

// Add Normal Enquiry Without Property ID
// * Add Normal Enquiry (Territory Partner) — with optional Property ID
export const addEnquiry = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const territoryId = req.params.id;

  if (!territoryId) {
    return res.status(400).json({ message: "Invalid Territory Partner Id" });
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

  // Case 1: With Property ID
  if (propertyid) {
    insertSQL = `
      INSERT INTO enquirers (
      territorypartnerid,
        territorypartner,
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?)
    `;

    insertData = [
      territoryId,
      territoryId, // territorypartnerid
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

  // Case 2: Without Property ID
  else {
    insertSQL = `
      INSERT INTO enquirers (
        territorybroker,
        territorypartner,
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
      territoryId, // territorybroker
      territoryId, // territorypartnerid
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

export const oldaddEnquiry = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const territoryId =req.territoryUser?.id;
  if (!territoryId) {
    return res.status(400).json({ message: "Invalid Terrritory Id" });
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
    territoryName,
    territoryContact,
  } = req.body;

  console.log(req.body);
  

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
    !message ||
    !territoryName ||
    !territoryContact
  ) {
    return res.status(400).json({ message: "All fields are required" });
  }

  let territoryInfo = territoryName + " - " + territoryContact;

  const insertSQL = `INSERT INTO enquirers (
    territorypartnerid,
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
    assign,
    source,
    territorystatus,
    updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?, ?)`;

  db.query(
    insertSQL,
    [
      territoryId,
      propertyid ?? null,
      customer,
      contact,
      minbudget,
      maxbudget,
      category,
      state,
      city,
      location,
      message,
      territoryInfo,
      "Direct",

      "Accepted",
      currentdate,
      currentdate,
    ],
    (err, result) => {
      if (err) {
        console.error("Error inserting:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      res.status(201).json({
        message: "Enquiry added successfully",
        Id: result.insertId,
      });
    }
  );
};
// Update Normal Enquiry Wit Property ID
export const updateEnquiry = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const enquiryId = req.params.id;

  if (!enquiryId) {
    return res.status(400).json({ message: "Invalid Enquiry Id" });
  }

  const {
    customer,
    propertyid,
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
    !propertyid ||
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

  const updateSQL = `UPDATE enquirers SET 
    customer = ?,
    propertyid= ?,
    contact = ?,
    minbudget = ?,
    maxbudget = ?,
    category = ?,
    state = ?,
    city = ?,
    location = ?,
    message = ?,
    updated_at = ?
    WHERE enquirersid = ?`;

  db.query(
    "SELECT * FROM enquirers WHERE enquirersid = ?",
    [enquiryId],
    (err, result) => {
      if (err) {
        return res.status(500).json({ message: "Database error", error: err });
      }

      if (result.length === 0) {
        return res.status(404).json({ message: "Enquiry not found" });
      }

      db.query(
        updateSQL,
        [
          customer,
          propertyid,
          contact,
          minbudget,
          maxbudget,
          category,
          state,
          city,
          location,
          message,
          currentdate,
          enquiryId,
        ],
        (err, result) => {
          if (err) {
            console.error("Error updating enquiry:", err);
            return res
              .status(500)
              .json({ message: "Database error", error: err });
          }

          res.status(200).json({
            message: "Enquiry updated successfully",
            affectedRows: result.affectedRows,
          });
        }
      );
    }
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
  }console.log(Id);


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
      SET salespersonid=null, territorybroker = ? 
      WHERE enquirersid = ?
    `;

    db.query(updateSql, [userId, Id], (err, updateResult) => {
      if (err) {
        console.error("Error Assigning Enquiry to Reparv:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      res.status(200).json({ message: "Enquiry assigned to Reparv successfully" });
    });
  });
};


export const getAllDigitalEnquiry = (req, res) => {
  const projectpartnerid = req.params.id;
if (!projectpartnerid) {
    return res
      .status(400)
      .json({ message: "Partner ID is required" });
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
    WHERE enquirers.territorybroker = ?
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
      created_at: moment.utc(row.created_at).tz("Asia/Kolkata").format("DD MMM YYYY | hh:mm A"),
      updated_at: moment.utc(row.updated_at).tz("Asia/Kolkata").format("DD MMM YYYY | hh:mm A"),
    }));

    res.json( {data: formatted});
  });
};

