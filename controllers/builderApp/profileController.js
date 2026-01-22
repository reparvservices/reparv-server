import db from "../../config/dbconnect.js";
import moment from "moment";
import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import crypto from "crypto";
import { deleteFromS3, uploadToS3 } from "../../utils/imageUpload.js";

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

export const getProfile = (req, res) => {
  console.log("builder");

  const Id = req.user?.id;
  if (!Id) {
    return res.status(400).json({ message: "Unauthorized User" });
  }

  const sql = `SELECT * FROM builders WHERE builderid = ?`;

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching profile:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(result[0]);
  });
};

export const editProfile = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(400).json({ message: "Invalid User ID" });
  }

  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const { fullname, username, contact, email } = req.body;

  if (!fullname || !username || !contact || !email) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    // STEP 1: Fetch existing user image
    db.query(
      "SELECT userimage FROM builders WHERE builderid = ?",
      [userId],
      async (err, result) => {
        if (err) {
          console.error("Error fetching user:", err);
          return res.status(500).json({ message: "Database error", error: err });
        }

        if (result.length === 0) {
          return res.status(404).json({ message: "User not found" });
        }

        const existingImage = result[0].userimage;
        let newImageUrl = existingImage;

        // STEP 2: Upload new image to S3 if provided
        if (req.file) {
          try {
            newImageUrl = await uploadToS3(req.file);

            // Delete old image from S3 if exists
            if (existingImage) {
              await deleteFromS3(existingImage);
            }
          } catch (s3Err) {
            console.error("S3 upload/delete error:", s3Err);
            return res.status(500).json({ message: "S3 upload/delete failed", error: s3Err });
          }
        }

        // STEP 3: Update user profile in DB
        const updateSql = `
          UPDATE builders 
          SET fullname = ?, username = ?, contact = ?, email = ?, userimage = ?, updated_at = ? 
          WHERE builderid = ?
        `;
        const updateValues = [fullname, username, contact, email, newImageUrl, currentdate, userId];

        db.query(updateSql, updateValues, (updateErr) => {
          if (updateErr) {
            console.error("Error updating profile:", updateErr);
            return res.status(500).json({
              message: "Database error during update",
              error: updateErr,
            });
          }

          res.status(200).json({ message: "Profile updated successfully" });
        });
      }
    );
  } catch (error) {
    console.error("Edit profile error:", error);
    return res.status(500).json({ message: "Server error", error });
  }
};


export const changePassword = async (req, res) => {
  const { email, newPassword } = req.body;

  try {
    //Securely hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    //  Update password in your salesperson  table
    const query = `UPDATE builders SET password = ? WHERE email = ?`;
    db.query(query, [hashedPassword, email], (err, result) => {
      if (err) throw err;
      console.log("Password updated successfully for email:", email);

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
  const query = "SELECT * FROM builders WHERE email = ?";
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
      
            <p>We received a request to reset your password for your <strong>Builder Reparv</strong> account.</p>
      
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

//Reset Password
export const resetPassword = async (req, res) => {
  const { email, newPassword } = req.body;

  try {
    //Securely hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    //  Update password in your salesperson  table
    const query = `UPDATE salespersons SET password = ? WHERE email = ?`;
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
