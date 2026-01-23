import db from "../../config/dbconnect.js";
import moment from "moment";

export const add = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const salesId = req.salesUser?.id;

  if (!salesId) {
    return res.status(400).json({ message: "Invalid Sales Id" });
  }

  const {
    propertyid,
    fullname,
    phone,
    state,
    city,
    minbudget,
    maxbudget,
    salesPersonName,
    salesPersonContact,
  } = req.body;

  // Validate required fields
  if (
    !propertyid ||
    !fullname ||
    !phone ||
    !state ||
    !city ||
    !minbudget ||
    !maxbudget ||
    !salesPersonName ||
    !salesPersonContact
  ) {
    return res.status(400).json({ message: "All fields are required" });
  }

  let salesInfo = `${salesPersonName} - ${salesPersonContact}`;

  // Step 1: Fetch propertyCategory using propertyid
  const categorySQL = `SELECT propertyCategory FROM properties WHERE propertyid = ?`;

  db.query(categorySQL, [propertyid], (err, results) => {
    if (err) {
      console.error("Error fetching property category:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "Property not found" });
    }

    const propertyCategory = results[0].propertyCategory;

    // Step 2: Insert enquiry
    const insertSQL = `INSERT INTO enquirers (
      propertyid, category, salespersonid, customer, contact,
      state, city, minbudget, maxbudget, source, assign,
      updated_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    db.query(
      insertSQL,
      [
        propertyid,
        propertyCategory,
        salesId,
        fullname,
        phone,
        state,
        city,
        minbudget,
        maxbudget,
        "Onsite",
        salesInfo,
        currentdate,
        currentdate,
      ],
      (err, result) => {
        if (err) {
          console.error("Error inserting enquiry:", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }

        res.status(201).json({
          message: "Enquiry added successfully",
          Id: result.insertId,
          propertyCategory: propertyCategory, // Optional: include in response
        });
      },
    );
  });
};

export const addEnquiry = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const salesId = req.salesUser?.id;

  if (!salesId) {
    return res.status(400).json({ message: "Invalid Sales Id" });
  }

  // If exists, use projectpartnerid — otherwise null
  const projectPartnerId = req.salesUser?.projectpartnerid || null;

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

  // Case 1: Enquiry with property ID
  if (propertyid) {
    insertSQL = `
      INSERT INTO enquirers (
        projectpartnerid,
        salespartner,
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    insertData = [
      projectPartnerId, // can be null if not linked
      salesId, // salespartner
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

  // Case 2: Enquiry without property ID
  else {
    insertSQL = `
      INSERT INTO enquirers (
        projectbroker,
        salesbroker,
        salespartner,
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    insertData = [
      projectPartnerId, // can be null if not linked
      salesId, // salesbroker
      salesId, // salespartner
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

  // Execute Insert
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

// Update Normal Enquiry Without Property ID
export const updateEnquiry = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const enquiryId = req.params.id;

  if (!enquiryId) {
    return res.status(400).json({ message: "Invalid Enquiry Id" });
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

  const updateSQL = `UPDATE enquirers SET 
    customer = ?,
    contact = ?,
    minbudget = ?,
    maxbudget = ?,
    category = ?,
    state = ?,
    city = ?,
    location = ?,
    propertyid = ?,
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
          contact,
          minbudget,
          maxbudget,
          category,
          state,
          city,
          location,
          propertyid,
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
        },
      );
    },
  );
};
