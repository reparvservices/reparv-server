import db from "../../config/dbconnect.js";
import { eventOtpSend } from "../../utils/eventOtpSend.js";
import { sendOtpSMS } from "../../utils/sendOtpSMS.js";

const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const sendUserOtp = async (req, res) => {
  const { mobile } = req.body;

  if (!mobile) {
    return res.status(400).json({
      success: false,
      message: "Mobile number is required",
    });
  }

  const otp = generateOtp();
  const expiry = new Date(Date.now() + 5 * 60 * 1000);

  const query = `
    INSERT INTO eventUsers (mobileNumber, otp, otp_expiry)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE 
      otp = VALUES(otp),
      otp_expiry = VALUES(otp_expiry)
  `;

  db.query(query, [mobile, otp, expiry], async (err) => {
    if (err) {
      console.log("DB Error:", err);
      return res.status(500).json({
        success: false,
        message: "Database error",
      });
    }

    try {
      const smsResponse = await sendOtpSMS(mobile, otp);
      console.log("SMS Response:", smsResponse);
      if (!smsResponse) {
        return res.status(500).json({
          success: false,
          message: "OTP generated but SMS failed",
        });
      }

      return res.status(200).json({
        success: true,
        message: "OTP sent successfully",
      });
    } catch (error) {
      console.log("SMS Error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to send OTP",
      });
    }
  });
};

export const verifyUserOtp = (req, res) => {
  const { mobile, otp } = req.body;

  if (!mobile || !otp) {
    return res.status(400).json({
      success: false,
      message: "Mobile and OTP required",
    });
  }

  const query = `
    SELECT * FROM eventUsers 
    WHERE mobileNumber = ? AND otp = ?
  `;

  db.query(query, [mobile, otp], (err, result) => {
    if (err) {
      console.log("DB Error:", err);
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

    const user = result[0];

    // ⛔ Check expiry
    if (!user.otp_expiry || new Date() > new Date(user.otp_expiry)) {
      return res.status(400).json({
        success: false,
        message: "OTP expired",
      });
    }

    const clearOtpQuery = `
      UPDATE eventUsers 
      SET otp = NULL, otp_expiry = NULL 
      WHERE mobileNumber = ?
    `;

    db.query(clearOtpQuery, [mobile], (err) => {
      if (err) {
        console.log("Clear OTP Error:", err);
      }

      return res.status(200).json({
        success: true,
        message: "OTP verified successfully",
        user,
        token: user.id, // replace with JWT later
      });
    });
  });
};
