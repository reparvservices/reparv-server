import db from "../../config/dbconnect.js";
import { sendOtpSMS } from "../../utils/sendOtpSMS.js";

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
