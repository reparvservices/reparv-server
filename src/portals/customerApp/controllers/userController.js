import moment from "moment-timezone";
import db from "#db";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { OAuth2Client } from "google-auth-library";
import e from "express";
import { deleteFromS3, uploadToS3 } from "#utils/imageUpload.js";

import { sendOtpSMS } from "#utils/sendOtpSMS.js";

import { convertSingleImageToWebp } from "#utils/convertSingleImageToWebp.js";
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

/** Static credentials for Apple App Review — never expires */
const APPLE_REVIEW_PHONE = "9867546352";
const APPLE_REVIEW_OTP = "506072";

const isAppleReviewAccount = (contact) =>
  String(contact) === APPLE_REVIEW_PHONE;
export const add = (req, res) => {
  try {
    const { fullname, contact } = req.body;

    console.log(req.body);

    if (!fullname || !contact) {
      return res.status(400).json({
        success: false,
        message: "Full name and contact are required",
      });
    }

    if (!/^[6-9]\d{9}$/.test(contact)) {
      return res.status(400).json({
        success: false,
        message: "Invalid contact number",
      });
    }

    const isBypassNumber = isAppleReviewAccount(contact);

    const otp = Math.floor(100000 + Math.random() * 900000);
    const otpExpiry = moment().add(5, "minutes").format("YYYY-MM-DD HH:mm:ss");
    const timestamp = moment().format("YYYY-MM-DD HH:mm:ss");

    const checkSql = "SELECT id FROM guestUsers WHERE contact = ?";

    db.query(checkSql, [contact], (err, users) => {
      if (err) {
        console.error(err);
        return res.status(500).json({
          success: false,
          message: "DB error",
        });
      }

      /* ================= LOGIN FLOW ================= */
      if (fullname === "User") {
        if (users.length === 0) {
          return res.status(404).json({
            success: false,
            message:
              "No account found with this contact. Please create an account first.",
          });
        }

        const guestUserId = users[0].id;

        // ✅ SKIP OTP UPDATE for bypass number
        if (isBypassNumber) {
          return res.status(200).json({
            success: true,
            message: "OTP bypass success",
          });
        }

        return db.query(
          "UPDATE guestUsers SET otp = ?, otp_expires_at = ?, updated_at = ? WHERE id = ?",
          [otp, otpExpiry, timestamp, guestUserId],
          (updateErr) => {
            if (updateErr) {
              console.error(updateErr);
              return res.status(500).json({
                success: false,
                message: "DB error",
              });
            }

            sendOtpSMS(contact, otp)
              .then(() => {
                console.log("OTP for", contact, "is", otp);
                return res.status(200).json({
                  success: true,
                  message: "OTP sent successfully",
                });
              })
              .catch((smsErr) => {
                console.error(smsErr);
                return res.status(500).json({
                  success: false,
                  message: "Failed to send OTP",
                });
              });
          },
        );
      }

      /* ================= SIGNUP FLOW ================= */

      if (users.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Number already registered, please login",
        });
      }

      // ✅ SKIP INSERT OTP for bypass number
      if (isBypassNumber) {
        return res.status(201).json({
          success: true,
          message: "Bypass signup success",
        });
      }

      db.query(
        `INSERT INTO guestUsers 
        (fullname, contact, otp, otp_expires_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [fullname, contact, otp, otpExpiry, timestamp, timestamp],
        (insertErr) => {
          if (insertErr) {
            console.error(insertErr);
            return res.status(500).json({
              success: false,
              message: "DB error",
            });
          }

          sendOtpSMS(contact, otp)
            .then(() => {
              console.log("OTP for", contact, "is", otp);
              return res.status(201).json({
                success: true,
                message: "Guest signup successful, OTP sent",
              });
            })
            .catch((smsErr) => {
              console.error(smsErr);
              return res.status(500).json({
                success: false,
                message: "Failed to send OTP",
              });
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
      const isReviewLogin = isAppleReviewAccount(user.contact);

      if (isReviewLogin) {
        if (String(otp) !== APPLE_REVIEW_OTP) {
          return res.status(401).json({
            success: false,
            message: "Invalid OTP",
          });
        }
      } else {
        if (String(user.otp) !== String(otp)) {
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
      }

      const token = jwt.sign(
        { id: user.id, contact: user.contact },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
      );

      // Keep static OTP available for Apple review account
      if (!isReviewLogin) {
        db.query(
          "UPDATE guestUsers SET otp=NULL, otp_expires_at=NULL WHERE id=?",
          [user.id],
        );
      }

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
  } catch (error) {
    console.error("OTP verification error:", error);
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

    if (isAppleReviewAccount(contact)) {
      return res.status(200).json({
        success: true,
        message: "OTP resent successfully",
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
  } catch (error) {
    console.error("OTP resend error:", error);
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
    const { user_id, fullname, email, contact, state, city, userimage } =
      req.body;

    if (!user_id || !fullname) {
      return res.status(400).json({
        success: false,
        message: "User ID and fullname required",
      });
    }
    console.log(req.body);

    const timestamp = moment().format("YYYY-MM-DD HH:mm:ss");

    // ✅ No multer, no S3 upload here — image URL comes directly from frontend
    const sql = `
      UPDATE guestUsers 
      SET fullname = ?, email = ?, contact = ?, userimage = ?, state = ?, city = ?, updated_at = ?
      WHERE id = ?
    `;

    await new Promise((resolve, reject) => {
      db.query(
        sql,
        [
          fullname,
          email ?? null,
          contact ?? null,
          userimage ?? null, // ✅ S3 URL sent from frontend
          state ?? null,
          city ?? null,
          timestamp,
          user_id,
        ],
        (err, result) => {
          if (err) return reject(err);
          resolve(result);
        },
      );
    });

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      userimage: userimage ?? null,
    });
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

export const deleteAccount = async (req, res) => {
  try {
    const { user_id } = req.body;

    /* ── Validation ── */
    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    /* ── Confirm user exists ── */
    db.query(
      "SELECT id, userimage FROM guestUsers WHERE id = ?",
      [user_id],
      async (err, users) => {
        if (err) {
          console.error("DB error:", err);
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

        const user = users[0];

        /* ── Delete profile image from S3 (if any) ── */
        if (user.userimage) {
          try {
            await deleteFromS3(user.userimage);
          } catch (s3Err) {
            console.error("S3 image delete error:", s3Err);
          }
        }

        /* ── Delete only safe dependent data ── */
        const deleteDependents = () =>
          new Promise((resolve, reject) => {
            // ✅ Only delete wishlist (safe)
            db.query(
              "DELETE FROM user_property_wishlist WHERE user_id = ?",
              [user_id],
              (err) => {
                if (err) return reject(err);
                resolve();
              },
            );
          });

        try {
          await deleteDependents();
        } catch (depErr) {
          console.error("Dependent delete error:", depErr);
          return res.status(500).json({
            success: false,
            message: "Failed to remove user data",
          });
        }

        /* ── Delete user ── */
        db.query("DELETE FROM guestUsers WHERE id = ?", [user_id], (delErr) => {
          if (delErr) {
            console.error("User delete error:", delErr);
            return res.status(500).json({
              success: false,
              message: "Failed to delete account",
            });
          }

          return res.status(200).json({
            success: true,
            message: "Account deleted successfully",
          });
        });
      },
    );
  } catch (error) {
    console.error("Delete account error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
