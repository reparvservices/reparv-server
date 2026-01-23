import db from "../../config/dbconnect.js";
import moment from "moment";
import { uploadToS3 } from "../../utils/imageUpload.js";

// **Fetch All **
export const getAll = (req, res) => {
  const projectPartnerId = req.employeeUser?.projectpartnerid;

  if (!projectPartnerId) {
    return res.status(401).json({
      message: "Unauthorized Access — Employee is not linked to any Project Partner.",
    });
  }
  const sql = `
    SELECT 
      enquirers.*, 
      properties.frontView,
      properties.seoSlug,
      properties.commissionType,
      properties.commissionAmount,
      properties.commissionPercentage,
      territorypartner.fullname AS territoryName, 
      territorypartner.contact AS territoryContact,
      propertyfollowup.*
    FROM enquirers 
    LEFT JOIN properties ON enquirers.propertyid = properties.propertyid
    LEFT JOIN territorypartner ON enquirers.territorypartnerid = territorypartner.id
    LEFT JOIN propertyfollowup ON propertyfollowup.enquirerid = enquirers.enquirersid
    WHERE enquirers.status = 'Token' AND propertyfollowup.status = 'Token' AND properties.projectpartnerid = ?
    ORDER BY propertyfollowup.created_at DESC
  `;

  db.query(sql, [projectPartnerId], (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
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
  const sql = `
    SELECT 
      enquirers.*, 
      properties.frontView,
      properties.seoSlug,
      properties.commissionType,
      properties.commissionAmount,
      properties.commissionPercentage,
      territorypartner.fullname AS territoryName, 
      territorypartner.contact AS territoryContact,
      propertyfollowup.*
    FROM enquirers 
    LEFT JOIN properties ON enquirers.propertyid = properties.propertyid
    LEFT JOIN territorypartner ON enquirers.territorypartnerid = territorypartner.id
    LEFT JOIN propertyfollowup ON propertyfollowup.enquirerid = enquirers.enquirersid
    WHERE enquirers.status = 'Token' AND propertyfollowup.status = 'Token' AND enquirers.enquirersid = ?
    ORDER BY enquirers.enquirersid DESC
  `;

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Customer not found" });
    }
    const formatted = result.map((row) => ({
      ...row,
      created_at: moment(row.created_at).format("DD MMM YYYY | hh:mm A"),
      updated_at: moment(row.updated_at).format("DD MMM YYYY | hh:mm A"),
    }));

    res.json(formatted[0]);
  });
};

export const getPaymentList = (req, res) => {
  const enquirerId = parseInt(req.params.id);
  if (isNaN(enquirerId)) {
    return res.status(400).json({ message: "Invalid Enquirer ID." });
  }

  const sql = `
    SELECT 
      customerPayment.*
    FROM customerPayment 
    WHERE customerPayment.enquirerId = ?
    ORDER BY customerPayment.created_at
  `;

  db.query(sql, [enquirerId], (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
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
export const addPayment = async (req, res) => {
  try {
    const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
    const enquirerId = parseInt(req.params.id, 10);

    // Validate ID
    if (isNaN(enquirerId)) {
      return res.status(400).json({ message: "Invalid Enquirer ID." });
    }

    const { paymentType, paymentAmount } = req.body;

    // Validate input
    if (!paymentType || !paymentAmount) {
      return res
        .status(400)
        .json({ message: "Payment Type and Amount are required." });
    }

    // Upload payment image to S3 if provided
    let paymentImageUrl = null;
    if (req.file) {
      try {
        paymentImageUrl = await uploadToS3(req.file);
      } catch (s3Err) {
        console.error("S3 upload error:", s3Err);
        return res.status(500).json({ message: "S3 upload failed", error: s3Err });
      }
    }

    // Check if enquirer exists
    db.query(
      "SELECT * FROM enquirers WHERE enquirersid = ?",
      [enquirerId],
      (err, result) => {
        if (err) {
          console.error("Error checking enquirer:", err);
          return res.status(500).json({ message: "Database error", error: err });
        }

        if (result.length === 0) {
          return res.status(404).json({ message: "Enquirer not found." });
        }

        // Insert payment
        db.query(
          `INSERT INTO customerPayment 
            (enquirerId, paymentType, paymentAmount, paymentImage, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?)`,
          [
            enquirerId,
            paymentType,
            paymentAmount,
            paymentImageUrl,
            currentdate,
            currentdate,
          ],
          (insertErr, insertResult) => {
            if (insertErr) {
              console.error("Error inserting payment:", insertErr);
              return res.status(500).json({
                message: "Failed to insert payment",
                error: insertErr,
              });
            }

            return res.status(200).json({
              message: "Payment added successfully.",
              insertedId: insertResult.insertId,
              paymentImage: paymentImageUrl, // return S3 URL
            });
          }
        );
      }
    );
  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};

