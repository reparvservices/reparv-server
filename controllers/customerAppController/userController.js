import moment from "moment";
import db from "../../config/dbconnect.js";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { OAuth2Client } from "google-auth-library";
import e from "express";
import { deleteFromS3, uploadToS3 } from "../../utils/imageUpload.js";
import { sendOtpSMS } from "../../utils/OtpSender.js";
import { convertSingleImageToWebp } from "../../utils/convertSingleImageToWebp.js";
const client = new OAuth2Client(process.env.MOBILE_GOOGLE_LOGIN_CLIENT_ID);

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

const generateOtp = () => Math.floor(100000 + Math.random() * 900000);

export const add = async (req, res) => {
  try {
    const { fullname, contact } = req.body;

    if (!fullname || !contact) {
      return res.status(400).json({
        success: false,
        message: "Full name and contact are required",
      });
    }

    const otp = generateOtp();
    const otpExpiry = moment().add(5, "minutes").format("YYYY-MM-DD HH:mm:ss");

    const timestamp = moment().format("YYYY-MM-DD HH:mm:ss");

    // 🔍 Check existing guest user
    const checkSql = "SELECT id FROM guestUsers WHERE contact = ?";

    db.query(checkSql, [contact], async (err, users) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: "DB error",
        });
      }

      /* ================= EXISTING GUEST USER ================= */
      if (users.length > 0) {
        const guestUserId = users[0].id;

        db.query(
          "UPDATE guestUsers SET otp = ?, otp_expires_at = ?, updated_at = ? WHERE id = ?",
          [otp, otpExpiry, timestamp, guestUserId],
        );

        await sendOtpSMS({ phone: contact, otp });

        return res.status(200).json({
          success: true,
          message: "OTP sent successfully",
        });
      }

      /* ================= NEW GUEST USER ================= */
      db.query(
        `INSERT INTO guestUsers 
         (fullname, contact, otp, otp_expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [fullname, contact, otp, otpExpiry, timestamp, timestamp],
        async (insertErr) => {
          if (insertErr) {
            return res.status(500).json({
              success: false,
              message: "DB error",
            });
          }

          await sendOtpSMS({ phone: contact, otp });

          return res.status(201).json({
            success: true,
            message: "Guest signup successful, OTP sent",
          });
        },
      );
    });
  } catch (error) {
    console.error("Guest signup error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};


export const verifyOtp = (req, res) => {
  try {
    const { contact, otp } = req.body;

    if (!contact || !otp) {
      return res.status(400).json({
        success: false,
        message: "Contact and OTP required",
      });
    }

    const sql = `
      SELECT id, fullname, contact, otp, otp_expires_at
      FROM guestUsers
      WHERE contact = ?
    `;

    db.query(sql, [contact], (err, users) => {
      if (err) {
        return res.status(500).json({ success: false, message: "DB error" });
      }

      if (users.length === 0) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const user = users[0];

      if (user.otp !== otp) {
        return res.status(401).json({
          success: false,
          message: "Invalid OTP",
        });
      }

      if (moment().isAfter(moment(user.otp_expires_at))) {
        return res.status(401).json({
          success: false,
          message: "OTP expired",
        });
      }

      const token = jwt.sign(
        { id: user.id, contact: user.contact },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
      );

      db.query(
        "UPDATE guestUsers SET otp=NULL, otp_expires_at=NULL WHERE id=?",
        [user.id],
      );

      return res.status(200).json({
        success: true,
        message: "OTP verified successfully",
        token,
        user: {
          id: user.id,
          fullname: user.fullname,
          contact: user.contact,
        },
      });
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
export const resendOtp = async (req, res) => {
  try {
    const { contact } = req.body;

    if (!contact) {
      return res.status(400).json({
        success: false,
        message: "Contact is required",
      });
    }

    const otp = generateOtp();
    const otpExpiry = moment().add(5, "minutes").format("YYYY-MM-DD HH:mm:ss");

    db.query(
      "UPDATE guestUsers SET otp=?, otp_expires_at=? WHERE contact=?",
      [otp, otpExpiry, contact],
      async (err, result) => {
        if (err || result.affectedRows === 0) {
          return res.status(500).json({
            success: false,
            message: "Failed to resend OTP",
          });
        }

        await sendOtpSMS({ phone: contact, otp });

        return res.status(200).json({
          success: true,
          message: "OTP resent successfully",
        });
      },
    );
  } catch {
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
export const getProfile = (req, res) => {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({
      success: false,
      message: "User ID is required",
    });
  }

  db.query("SELECT * FROM guestUsers WHERE id=?", [id], (err, users) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: "Database error",
      });
    }

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Profile fetched successfully",
      data: users[0],
    });
  });
};


export const update = async (req, res) => {
  try {
    const { user_id, fullname, email, contact } = req.body;

    if (!user_id || !fullname) {
      return res.status(400).json({
        success: false,
        message: "User ID and fullname required",
      });
    }

    const timestamp = moment().format("YYYY-MM-DD HH:mm:ss");

    db.query(
      "SELECT userimage FROM guestUsers WHERE id = ?",
      [user_id],
      async (err, result) => {
        if (err || result.length === 0) {
          return res.status(404).json({
            success: false,
            message: "User not found",
          });
        }

        let imageUrl = result[0].userimage;

        /* ===== IMAGE CONVERT + UPLOAD ===== */
        if (req.file) {
          const convertedImage = await convertSingleImageToWebp(req.file);

          if (convertedImage) {
            imageUrl = await uploadToS3(convertedImage);
          }

          // 🗑 delete old image from S3
          if (result[0].userimage) {
            await deleteFromS3(result[0].userimage);
          }
        }

        const sql = `
          UPDATE guestUsers 
          SET fullname = ?, email = ?, contact = ?, userimage = ?, updated_at = ?
          WHERE id = ?
        `;

        db.query(
          sql,
          [fullname, email, contact, imageUrl, timestamp, user_id],
          () => {
            return res.status(200).json({
              success: true,
              message: "Profile updated successfully",
              userimage: imageUrl,
            });
          },
        );
      },
    );
  } catch (error) {
    console.error("Profile update error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};


export const googleLogin = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Google token is required",
      });
    }

    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.MOBILE_GOOGLE_LOGIN_CLIENT_ID,
    });

    const { email, name, picture, sub } = ticket.getPayload();
    const timestamp = moment().format("YYYY-MM-DD HH:mm:ss");

    db.query(
      "SELECT id, fullname, email, userimage FROM guestUsers WHERE email=?",
      [email],
      (err, users) => {
        if (err) {
          console.error("DB error:", err);
          return res.status(500).json({
            success: false,
            message: "Database error",
          });
        }

        // 🔹 Existing user
        if (users.length > 0) {
          const user = users[0];

          const jwtToken = jwt.sign(
            { id: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: "7d" },
          );
          console.log("EX");

          return res.status(200).json({
            success: true,
            token: jwtToken,
            user: {
              id: user.id,
              fullname: user.fullname,
              email: user.email,
              picture: user.userimage,
            },
          });
        }

        // 🔹 New user
        db.query(
          `INSERT INTO guestUsers
           (fullname, email, google_id, userimage, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [name, email, sub, picture, timestamp, timestamp],
          (err, result) => {
            if (err) {
              console.error("Insert error:", err);
              return res.status(500).json({
                success: false,
                message: "Failed to create user",
              });
            }

            const jwtToken = jwt.sign(
              { id: result.insertId, email },
              process.env.JWT_SECRET,
              { expiresIn: "7d" },
            );
            console.log("NEW");

            return res.status(201).json({
              success: true,
              token: jwtToken,
              user: {
                id: result.insertId,
                fullname: name,
                email,
                picture,
              },
            });
          },
        );
      },
    );
  } catch (error) {
    console.error("Google login error:", error);
    return res.status(401).json({
      success: false,
      message: "Invalid Google token",
    });
  }
};

export const facebookLogin = async (req, res) => {
  try {
    const { uid, email, displayName, photoURL } = req.body;

    if (!uid || !email) {
      return res.status(400).json({
        success: false,
        message: "Facebook user data is missing",
      });
    }

    const timestamp = moment().format("YYYY-MM-DD HH:mm:ss");

    db.query(
      "SELECT id, fullname, email, userimage FROM guestUsers WHERE email=?",
      [email],
      (err, users) => {
        if (err) {
          console.error("DB error:", err);
          return res.status(500).json({
            success: false,
            message: "Database error",
          });
        }

        /* 🔹 Existing user */
        if (users.length > 0) {
          const user = users[0];

          const jwtToken = jwt.sign(
            { id: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: "7d" },
          );

          return res.status(200).json({
            success: true,
            token: jwtToken,
            user: {
              id: user.id,
              fullname: user.fullname,
              email: user.email,
              picture: user.userimage,
            },
          });
        }

        /* 🔹 New user */
        db.query(
          `INSERT INTO guestUsers
           (fullname, email, facebook_id, userimage, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [displayName, email, uid, photoURL, timestamp, timestamp],
          (err, result) => {
            if (err) {
              console.error("Insert error:", err);
              return res.status(500).json({
                success: false,
                message: "Failed to create user",
              });
            }

            const jwtToken = jwt.sign(
              { id: result.insertId, email },
              process.env.JWT_SECRET,
              { expiresIn: "7d" },
            );

            return res.status(201).json({
              success: true,
              token: jwtToken,
              user: {
                id: result.insertId,
                fullname: displayName,
                email,
                picture: photoURL,
              },
            });
          },
        );
      },
    );
  } catch (error) {
    console.error("Facebook login error:", error);
    return res.status(500).json({
      success: false,
      message: "Facebook login failed",
    });
  }
};

