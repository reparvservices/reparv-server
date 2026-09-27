import db from "#db";
import moment from "moment-timezone";
import { isPhoneVerificationValid } from "../../shared/controllers/otpController.js";

export const add = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");

  const {
    propertyid,
    fullname,
    phone,
    state,
    city,
    minbudget,
    maxbudget,
    source,
    otpToken,
  } = req.body;

  if (
    !propertyid ||
    !fullname ||
    !phone ||
    !state ||
    !city ||
    !minbudget ||
    !maxbudget ||
    !source
  ) {
    return res.status(400).json({ message: "All fields are required" });
  }

  // Site visit bookings must come from an OTP-verified phone number
  if (!isPhoneVerificationValid(otpToken, phone)) {
    return res.status(401).json({
      code: "OTP_REQUIRED",
      message: "Please verify your phone number with OTP to book a site visit.",
    });
  }
  
  const minBudget = parseFloat(minbudget);
  const maxBudget = parseFloat(maxbudget);

  // 1 Fetch projectpartnerid + propertyCategory
  const propertySQL = `
      SELECT projectpartnerid, propertyCategory 
      FROM properties 
      WHERE propertyid = ?
  `;

  db.query(propertySQL, [propertyid], (err, results) => {
    if (err) {
      console.error("Error fetching property:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "Property not found" });
    }

    const propertyCategory = results[0].propertyCategory;
    const projectpartnerid = results[0].projectpartnerid;

    // 2 Insert enquiry
    const insertSQL = `
      INSERT INTO enquirers (
        projectpartnerid, propertyid, category, customer, contact, state, city,
        minbudget, maxbudget, source, updated_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(
      insertSQL,
      [
        projectpartnerid,
        propertyid,
        propertyCategory,
        fullname,
        phone,
        state,
        city,
        minBudget,
        maxBudget,
        source,
        currentdate,
        currentdate,
      ],
      (err, result) => {
        if (err) {
          console.error("Error inserting enquiry:", err);
          return res.status(500).json({
            message: "Database error",
            error: err,
          });
        }

        res.status(201).json({
          message: "Enquiry added successfully",
          Id: result.insertId,
          projectpartnerid: projectpartnerid,
          propertyCategory: propertyCategory,
        });
      }
    );
  });
};
