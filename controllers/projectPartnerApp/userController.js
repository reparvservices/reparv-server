import db from "../../config/dbconnect.js";
import moment from "moment";
import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const saltRounds = 10;

export const getAll = async (req, res) => {
  try {
    const sql = "SELECT * FROM projectpartner";
    db.query(sql, (err, result) => {
      if (err) {
        console.error("Error fetching:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      res.json(result);
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message,
    });
  }
};

export const resetPassword = async (req, res) => {
  const { email, newPassword } = req.body;

  try {
    //Securely hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    //  Update password in your salesperson  table
    const query = `UPDATE projectpartner SET password = ? WHERE email = ?`;
    db.query(query, [hashedPassword, email], (err, result) => {
      if (err) throw err;

      return res.json({
        success: true,
        message: "Password updated successfully. You can now log in.",
      });
    });
  } catch (error) {
    console.error("Password reset error:", error);
    res.status(500).json({ success: false, message: "Something went wrong." });
  }
};

//Reset Password
export const sendOtp = async (req, res) => {
  const email = req.params.id;
  console.log("ee", email);

  // Check if email exists in salespersons
  const query = "SELECT * FROM projectpartner WHERE email = ?";
  db.query(query, [email], async (err, results) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ message: "Database error" });
    }

    if (results.length === 0) {
      // Email not found
      console.log("email");

      return res.status(404).json({ message: "Email not found" });
    }

    //  Email exists, now generate OTP and send email
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
    const ttl = 5 * 60 * 1000; // 5 minutes
    const expires = Date.now() + ttl;

    const data = `${email}.${otp}.${expires}`;
    const secret = process.env.JWT_SECRET; // Move this to process.env in production
    const hash = crypto.createHmac("sha256", secret).update(data).digest("hex");
    const fullHash = `${hash}.${expires}`;

    try {
      const mailOptions = {
        from: `"Reparv Support" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `🔐 Your OTP for Password Reset - Reparv`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: #0078DB;">Hello,</h2>
      
            <p>We received a request to reset your password for your <strong>ProjectPartner Reparv</strong> account.</p>
      
            <p>Your One-Time Password (OTP) is:</p>
      
            <h1 style="color: #0BB501; font-size: 32px;">${otp}</h1>
      
            <p>This OTP is valid for <strong>5 minutes</strong>. Please enter this code in the app to proceed with resetting your password.</p>
      
            <p>If you did not request a password reset, you can safely ignore this email. Your account will remain secure.</p>
      
            <br />
      
            <p>Thanks & regards,</p>
            <p><strong>Team Reparv</strong><br />
            <a href="https://www.reparv.in" target="_blank" style="color: #0078DB;">www.reparv.in</a></p>
      
            <hr style="margin-top: 20px;" />
            <small style="color: #888;">This is an automated message, please do not reply.</small>
          </div>
        `,
      };

      await transporter.sendMail(mailOptions);
      console.log(`builder Email sent successfully to ${email}`);

      //  Respond with hash
      res.json({ hash: fullHash });
    } catch (error) {
      console.error("Error sending email:", error.message || error);
      res.status(500).json({ message: "Failed to send OTP email" });
    }
  });
};
export const verifyOtp = (req, res) => {
  const { email, otp, hash } = req.body;
  console.log({ email, otp, hash });

  const [hashValue, expires] = hash.split(".");

  if (Date.now() > parseInt(expires)) {
    return res.status(400).json({ message: "OTP expired" });
  }

  const data = `${email}.${otp}.${expires}`;
  const secret = process.env.JWT_SECRET; // Store securely in .env
  const newHash = crypto
    .createHmac("sha256", secret)
    .update(data)
    .digest("hex");
  console.log(newHash, "new", hashValue);

  if (newHash === hashValue) {
    return res.json({ verified: true });
  }

  return res.status(400).json({ message: "Invalid OTP" });
};

//GET Project partner based on city
export const getProjectPartner = async (req, res) => {
  try {
    const city = req.params.city;
    if (!city) {
      return res.status(500).json({
        message: "City Required !",
      });
    }
    const sql =
      "SELECT id,fullname,city,contact FROM projectpartner Where city = ?";
    db.query(sql, [city], (err, result) => {
      if (err) {
        console.error("Error fetching:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      res.json(result);
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message,
    });
  }
};

export const updateOneSignalId = async (req, res) => {
  const { onesignalId } = req.body;
console.log(onesignalId);

  const id = req.params.id;
  console.log(id);
  
  if (!onesignalId) {
    return res
      .status(400)
      .json({ success: false, message: "onesignalId is required" });
  }
  try {
    const query = `UPDATE projectpartner SET onesignalid = ? WHERE id = ?`;
    db.query(query, [onesignalId, id], (err, result) => {
      if (err) {
        console.error("OneSignal update error:", err);
        return res
          .status(500)
          .json({ success: false, message: "Database error" });
      }

      if (result.affectedRows === 0) {
        console.log("not");

        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }
      console.log("suucess");

      return res.json({
        success: true,
        message: "OneSignal ID stored successfully",
        onesignalId,
      });
    });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ success: false, message: "Something went wrong" });
  }
};