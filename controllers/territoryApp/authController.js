import moment from "moment";
import db from "../../config/dbconnect.js";
import { sendOtpSMS } from "../../utils/sendOtpSMS.js";
import { uploadToS3 } from "../../utils/imageUpload.js";

export const add = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");

  let {
    fullName,
    contactNumber,
    email,
    profilePhoto,
    state,
    city,
    territory,
    propertyType,
    interestReason,
    experience,
    previousBrokerage,
    shortBio,
    partnerStatus,
    commissionSigned,
    leadSharing,
    visibleInNetwork,
    projectpartnerid,
  } = req.body;

  if (!fullName || !contactNumber || !email) {
    return res.status(400).json({
      message: "Full Name, Contact Number and Email are required!",
    });
  }

  console.log(req.body, "ssss");

  email = email?.toLowerCase();
  let userimage = null;

  if (req.files && req.files.profileImage) {
    const file = req.files.profileImage[0];

    try {
      userimage = await uploadToS3(file);
    } catch (uploadErr) {
      return res.status(500).json({
        message: "Image upload failed",
        error: uploadErr,
      });
    }
  }

  console.log("Uploaded Image URL:", userimage);

  try {
    const checkSql = `SELECT * FROM territorypartner WHERE contact = ? OR email = ?`;

    db.query(checkSql, [contactNumber, email], (err, rows) => {
      if (err) {
        return res.status(500).json({
          message: "Database error",
          error: err,
        });
      }

      if (rows.length > 0) {
        const dup = rows[0];

        if (dup.contact === contactNumber) {
          return res.status(409).json({
            message: "Contact number already exists",
            field: "contactNumber",
          });
        }

        if (dup.email === email) {
          return res.status(409).json({
            message: "Email already exists",
            field: "email",
          });
        }
      }

      const insertSql = `
        INSERT INTO territorypartner 
        (
         projectpartnerid,
          fullname,
          contact,
          email,
          userimage,
          city,
          state,
          address,
          propertyType,
          intrest,
          experience,
          previousBrokerage,
          shortBio,
          status,
          agreement,
          refrence,
          is_active,
          created_at,
          updated_at
        )
        VALUES (?, ?,?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?)
      `;

      db.query(
        insertSql,
        [
          projectpartnerid,
          fullName,
          contactNumber,
          email,
          userimage,
          city,
          state,
          territory,
          propertyType,
          interestReason,
          experience,
          previousBrokerage,
          shortBio,
          partnerStatus || "Active",
          commissionSigned ? "Signed" : "Pending",
          leadSharing ? "Yes" : "No",
          visibleInNetwork ? "Active" : "Inactive",
          currentdate,
          currentdate,
        ],
        (insertErr, result) => {
          if (insertErr) {
            return res.status(500).json({
              message: "Database insert error",
              error: insertErr,
            });
          }

          return res.status(201).json({
            message: "Territory Partner added successfully",
            partnerId: result.insertId,
          });
        },
      );
    });
  } catch (error) {
    console.error("Add Territory Partner Error:", error);
    return res.status(500).json({
      message: "Server error",
      error: error,
    });
  }
};
// 🔥 Generate OTP
const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000);
};

// ===============================
// SEND OTP
// ===============================

export const sendterritorypartnerOtp = async (req, res) => {
  const { mobile } = req.body;

  console.log("Mobile:", mobile);

  if (!mobile) {
    return res.status(400).json({
      success: false,
      message: "Mobile number is required",
    });
  }

  const checkQuery = "SELECT * FROM territorypartner WHERE contact = ?";

  db.query(checkQuery, [mobile], (err, result) => {
    if (err) {
      console.log("DB Error:", err);
      return res.status(500).json({ message: "Database error" });
    }

    if (result.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Mobile number not registered",
      });
    }

    const otp = generateOtp(); // no await needed

    const updateQuery = "UPDATE territorypartner SET otp = ? WHERE contact = ?";

    db.query(updateQuery, [otp, mobile], async (err) => {
      if (err) {
        console.log("OTP Store Error:", err);
        return res.status(500).json({
          success: false,
          message: "Failed to store OTP",
        });
      }

      try {
        // 🔥 SEND OTP SMS
        const smsResponse = await sendOtpSMS(mobile, otp);

        if (!smsResponse.success) {
          return res.status(500).json({
            success: false,
            message: "OTP generated but SMS failed",
            error: smsResponse.error,
          });
        }

        return res.status(200).json({
          success: true,
          message: "OTP sent successfully",
        });
      } catch (smsError) {
        console.log("SMS Error:", smsError);

        return res.status(500).json({
          success: false,
          message: "Failed to send OTP",
        });
      }
    });
  });
};

// ===============================
// VERIFY OTP
// ===============================

export const verifyterritorypartnerOtp = (req, res) => {
  const { mobile, otp } = req.body;
  console.log(mobile, "dd", otp);

  if (!mobile || !otp) {
    return res.status(400).json({
      success: false,
      message: "Mobile and OTP required",
    });
  }

  const query = "SELECT * FROM territorypartner WHERE contact = ? AND otp = ?";

  db.query(query, [mobile, otp], (err, result) => {
    if (err) {
      console.log(err);
      return res.status(500).json({
        success: false,
        message: "Database error",
      });
    }

    if (result.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    const clearOtpQuery =
      "UPDATE territorypartner SET otp = NULL WHERE contact = ?";

    db.query(clearOtpQuery, [mobile], (err) => {
      if (err) {
        console.log(err);
      }

      console.log(result[0]);

      return res.status(200).json({
        success: true,
        message: "OTP verified successfully",
        user: result[0],
        token: result[0].id,
      });
    });
  });
};
