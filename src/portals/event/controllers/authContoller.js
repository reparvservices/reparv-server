import db from "#db";
import { eventOtpSend } from "#utils/eventOtpSend.js";
import { sendOtpSMS } from "#utils/sendOtpSMS.js";

const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const sendUserOtp = async (req, res) => {
  const { mobile } = req.body;

  console.log("Received Mobile:", mobile);
  if (!mobile) {
    return res.status(400).json({
      success: false,
      message: "Mobile number is required",
    });
  }

  const otp = generateOtp();
  const expiry = new Date(Date.now() + 5 * 60 * 1000);

  // 🔹 Step 1: Check if user exists
  const checkQuery = `SELECT * FROM eventUsers WHERE mobileNumber = ?`;

  db.query(checkQuery, [mobile], async (err, result) => {
    if (err) {
      console.log("Check Error:", err);
      return res.status(500).json({
        success: false,
      });
    }

    let query;
    let values;

    if (result.length > 0) {
      // 🔹 User exists → UPDATE OTP
      query = `
        UPDATE eventUsers 
        SET otp = ?, otp_expiry = ? 
        WHERE mobileNumber = ?
      `;
      values = [otp, expiry, mobile];
    } else {
      // 🔹 New user → INSERT
      query = `
        INSERT INTO eventUsers (mobileNumber, otp, otp_expiry)
        VALUES (?, ?, ?)
      `;
      values = [mobile, otp, expiry];
    }

    // 🔹 Step 2: Run INSERT or UPDATE
    db.query(query, values, async (err) => {
      if (err) {
        console.log("Insert/Update Error:", err);
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

    //  Do NOT clear OTP
    return res.status(200).json({
      success: true,
      message: "OTP verified successfully",
      user,
      token: user.id, // replace with JWT later
    });
  });
};
