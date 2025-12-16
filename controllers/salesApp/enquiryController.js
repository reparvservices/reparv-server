import db from "../../config/dbconnect.js";
import moment from "moment";
// Assign Enquiry To Territory Partners
export const assignEnquiry = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const { territorypartnerid, territorypartnerdate, territorytimeslot } =
    req.body;
  console.log(territorypartnerid, territorypartnerdate, territorytimeslot);

  if (!territorypartnerid || !territorypartnerdate || !territorytimeslot) {
    return res.status(400).json({ message: "All Fields Required !!" });
  }
  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Enquiry ID" });
  }
  console.log(Id);

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
        "UPDATE enquirers SET territorypartnerid = ?, visitdate = ?,territorytimeslot=?, updated_at = ?, created_at = ? WHERE enquirersid = ?",
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
        }
      );
    }
  );
};

export const getAll = (req, res) => {
  const territoryPartnerId = req.params.id;

  if (!territoryPartnerId) {
    return res
      .status(400)
      .json({ message: "Territory Partner ID is required" });
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
    WHERE enquirers.salespersonid = ?
    ORDER BY enquirers.enquirersid DESC`;

  db.query(sql, [territoryPartnerId], (err, results) => {
    if (err) {
      console.error("Database Query Error:", err);
      return res
        .status(500)
        .json({ message: "Database query error", error: err });
    }

    const formatted = results.map((row) => ({
      ...row,
      created_at: moment(row.created_at).format("DD MMM YYYY | hh:mm A"),
      updated_at: moment(row.updated_at).format("DD MMM YYYY | hh:mm A"),
    }));

    res.json(formatted);
  });
};

export const addEnquiry = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const salesId = req.body.salesId;
  console.log(req.body);

  if (!salesId) {
    return res.status(400).json({ message: "Invalid Sales Id" });
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

  // Validate all required fields
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
      salespersonid,
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?)
    `;

    insertData = [
      salesId,
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    insertData = [
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

  // Execute insert
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
     propertyid=?,
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
          propertyid ?? null,
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
    }
  );
};

export const getAllDigitalEnquiry = (req, res) => {
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
    WHERE enquirers.salesbroker = ?
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
      created_at: moment(row.created_at).format("DD MMM YYYY | hh:mm A"),
      updated_at: moment(row.updated_at).format("DD MMM YYYY | hh:mm A"),
    }));

    res.json({ data: formatted });
  });
};

