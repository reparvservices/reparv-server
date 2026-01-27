import db from "../../config/dbconnect.js";
import moment from "moment";
import csv from "csv-parser";
import { uploadToS3 } from "../../utils/imageUpload.js"; // Your S3 helper
import { Readable } from "stream";

export const addCSVEnquiry = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "CSV file is required" });
  }

  const userId = req.projectPartnerUser?.id;
  if (!userId) {
    return res.status(400).json({ message: "Invalid Id" });
  }

  try {
    // Upload CSV to S3
    const csvUrl = await uploadToS3(req.file); // Returns the S3 URL

    const results = [];
    const stream = Readable.from(req.file.buffer); // Use memory buffer instead of disk
    stream
      .pipe(csv())
      .on("data", (row) => results.push(row))
      .on("end", () => {
        if (results.length === 0) {
          return res.status(400).json({ message: "CSV is empty" });
        }

        const values = results.map((row) => [
          "CSV File",
          row.customer || null,
          row.contact || null,
          row.minbudget || null,
          row.maxbudget || null,
          row.category || null,
          row.location || null,
          row.state || null,
          row.city || null,
          row.status || "New",
          row.message || null,
          userId,
          userId,
        ]);

        const query = `
          INSERT INTO enquirers (
            source, customer, contact, minbudget, maxbudget, category, location,
            state, city, status, message, projectpartner, projectpartnerid
          ) VALUES ?
        `;

        db.query(query, [values], (err) => {
          if (err) {
            console.error(err);
            return res
              .status(500)
              .json({ message: "Database insert failed", error: err });
          }

          res.json({
            message: "CSV data inserted into enquirers table successfully!",
            csvUrl, // Optional: S3 link
          });
        });
      });
  } catch (err) {
    console.error("CSV processing error:", err);
    res.status(500).json({ message: "Server error", error: err });
  }
};

// * Add Normal Enquiry (with or without Property ID)
export const addEnquiry = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const Id = req.projectPartnerUser?.id;

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
        projectpartnerid,
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
      Id,
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
        }
      );
    }
  );
};
