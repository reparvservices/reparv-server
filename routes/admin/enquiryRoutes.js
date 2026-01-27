import express from "express";
import multer from "multer";
import csv from "csv-parser";
import moment from "moment";
import db from "../../config/dbconnect.js";
import { Readable } from "stream";

const router = express.Router();

// ---------------- MULTER MEMORY STORAGE ----------------
const memoryStorage = multer.memoryStorage();

const upload = multer({
  storage: memoryStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["text/csv", "application/vnd.ms-excel"];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only CSV files are allowed"), false);
    }
    cb(null, true);
  },
});

// ---------------- MULTER ERROR HANDLER ----------------
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: err.message });
  } else if (err) {
    return res.status(400).json({
      message: err.message || "Upload failed",
    });
  }
  next();
});

// ================= CSV UPLOAD =================
router.post("/csv/add", upload.single("csv"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "CSV file is required" });
  }

  const results = [];

  // Convert buffer → stream
  Readable.from(req.file.buffer)
    .pipe(csv())
    .on("data", (row) => results.push(row))
    .on("end", () => {
      if (results.length === 0) {
        return res.status(400).json({ message: "CSV file is empty" });
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
      ]);

      const query = `
        INSERT INTO enquirers (
          source, customer, contact, minbudget, maxbudget, category, location,
          state, city, status, message
        ) VALUES ?
      `;

      db.query(query, [values], (err) => {
        if (err) {
          console.error(err);
          return res.status(500).json({
            message: "Database insert failed",
            error: err,
          });
        }

        res.json({
          message: "CSV data inserted into enquirers table successfully!",
          insertedRows: values.length,
        });
      });
    });
});

// ================= ADD ENQUIRY =================
router.post("/add/enquiry", async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");

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

  try {
    let projectpartnerid = null;

    if (propertyid) {
      const [property] = await new Promise((resolve, reject) => {
        db.query(
          "SELECT projectpartnerid FROM properties WHERE propertyid = ?",
          [propertyid],
          (err, results) => {
            if (err) return reject(err);
            resolve(results);
          }
        );
      });

      if (!property) {
        return res.status(404).json({ message: "Property not found" });
      }

      projectpartnerid = property.projectpartnerid;
    }

    const insertSQL = propertyid
      ? `
        INSERT INTO enquirers (
          customer, contact, minbudget, maxbudget, category, state, city,
          location, propertyid, projectpartnerid, message, source,
          updated_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      : `
        INSERT INTO enquirers (
          customer, contact, minbudget, maxbudget, category, state, city,
          location, message, source, updated_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

    const insertData = propertyid
      ? [
          customer,
          contact,
          minbudget,
          maxbudget,
          category,
          state,
          city,
          location,
          propertyid,
          projectpartnerid,
          message,
          "Direct",
          currentdate,
          currentdate,
        ]
      : [
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

    db.query(insertSQL, insertData, (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      res.status(201).json({
        message: "Enquiry added successfully",
        enquiryId: result.insertId,
      });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error });
  }
});

// ================= UPDATE ENQUIRY =================
router.put("/update/enquiry/:id", async (req, res) => {
  const enquiryId = req.params.id;
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");

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

  try {
    let projectpartnerid = null;

    if (propertyid) {
      const [property] = await new Promise((resolve, reject) => {
        db.query(
          "SELECT projectpartnerid FROM properties WHERE propertyid = ?",
          [propertyid],
          (err, results) => {
            if (err) return reject(err);
            resolve(results);
          }
        );
      });

      if (!property) {
        return res.status(404).json({ message: "Property not found" });
      }

      projectpartnerid = property.projectpartnerid;
    }

    const updateSQL = `
      UPDATE enquirers SET
        customer = ?,
        contact = ?,
        minbudget = ?,
        maxbudget = ?,
        category = ?,
        state = ?,
        city = ?,
        location = ?,
        propertyid = ?,
        projectpartnerid = ?,
        message = ?,
        updated_at = ?
      WHERE enquirersid = ?
    `;

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
        projectpartnerid,
        message,
        currentdate,
        enquiryId,
      ],
      (err, result) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ message: "Database error", error: err });
        }

        res.json({
          message: "Enquiry updated successfully",
          affectedRows: result.affectedRows,
        });
      }
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error });
  }
});

export default router;