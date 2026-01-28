import db from "../../config/dbconnect.js";
import moment from "moment";
import { uploadToS3 } from "../../utils/imageUpload.js";

// **Fetch All **
export const getAll = (req, res) => {
  const userId = req.projectPartnerUser?.id;
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

  db.query(sql, [userId], (err, result) => {
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
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const enquirerId = parseInt(req.params.id, 10);

  if (isNaN(enquirerId)) {
    return res.status(400).json({ message: "Invalid Enquirer ID." });
  }

  const { paymentType, paymentAmount } = req.body;

  if (!paymentType || !paymentAmount) {
    return res
      .status(400)
      .json({ message: "Payment Type and Amount are required." });
  }

  try {
    // Upload image to S3 if file exists
    let paymentImageUrl = null;
    if (req.file) {
      paymentImageUrl = await uploadToS3(req.file); // your S3 upload function should return the file URL
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

        // Insert payment record
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
              paymentImage: paymentImageUrl,
            });
          }
        );
      }
    );
  } catch (uploadErr) {
    console.error("S3 upload error:", uploadErr);
    return res.status(500).json({ message: "Image upload failed", error: uploadErr });
  }
};