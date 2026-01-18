import moment from "moment";
import db from "../../config/dbconnect.js";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { OAuth2Client } from "google-auth-library";
import e from "express";
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

export const add = (req, res) => {
  try {
    console.log(req.body);
    
    const { fullname, contact } = req.body;
    const timestamp = moment().format("YYYY-MM-DD HH:mm:ss");

    if (!fullname || !contact) {
      return res.status(400).json({
        success: false,
        message: "Full name and contact are required",
      });
    }

    const checkSql =
      "SELECT user_id, fullname, contact FROM mobileusers WHERE contact = ?";

    db.query(checkSql, [contact], (checkErr, users) => {
      if (checkErr) {
        return res.status(500).json({
          success: false,
          message: "Database error",
        });
      }

      if (users.length > 0) {
        const user = users[0];

        const token = jwt.sign(
          { id: user.user_id, contact: user.contact },
          process.env.JWT_SECRET,
          { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
        );

        return res.status(200).json({
          success: true,
          message: "Login successful",
          token,
          user: {
            id: user.user_id,
            fullname: user.fullname,
            contact: user.contact,
          },
        });
      }

      const insertSql = `
        INSERT INTO mobileusers (fullname, contact, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `;

      db.query(
        insertSql,
        [fullname, contact, timestamp, timestamp],
        (insertErr, result) => {
          if (insertErr) {
            return res.status(500).json({
              success: false,
              message: "Database error",
            });
          }

          const token = jwt.sign(
            { id: result.insertId, contact },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
          );

          return res.status(201).json({
            success: true,
            message: "Signup successful",
            token,
            user: {
              id: result.insertId,
              fullname,
              contact,
            },
          });
        }
      );
    });
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

  const sql = `
    SELECT *
    FROM mobileusers
    WHERE user_id = ?
  `;

  db.query(sql, [id], (err, users) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: "Database error",
        error: err.message,
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
      data: users[0], // all fields returned
    });
  });
};

export const update = (req, res) => {
  try {
    const { user_id, fullname, email, contact } = req.body;
    const userimage = req.file ? `/uploads/${req.file.filename}` : null;
    const timestamp = moment().format("YYYY-MM-DD HH:mm:ss");

    //  user_id is mandatory
    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    //  Full name is mandatory
    if (!fullname || !fullname.trim()) {
      return res.status(400).json({
        success: false,
        message: "Full name is required",
      });
    }

    //  At least ONE must be present
    if (!email && !contact) {
      return res.status(400).json({
        success: false,
        message: "Email or contact number is required",
      });
    }

    let sql = `
      UPDATE mobileusers
      SET fullname = ?, updated_at = ?
    `;
    const params = [fullname, timestamp];

    //  Update email only if provided
    if (email) {
      sql += `, email = ?`;
      params.push(email);
    }

    // Update contact only if provided
    if (contact) {
      sql += `, contact = ?`;
      params.push(contact);
    }

    //Update image only if uploaded
    if (userimage) {
      sql += `, userimage = ?`;
      params.push(userimage);
    }

    sql += ` WHERE user_id = ?`;
    params.push(user_id);

    db.query(sql, params, (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({
          success: false,
          message: "Database error",
        });
      }

      //No user found
      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        data: {
          user_id,
          fullname,
          email,
          contact,
          userimage,
        },
      });
    });
  } catch (error) {
    console.error(error);
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

    // Verify Google token
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.MOBILE_GOOGLE_LOGIN_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, picture, sub } = payload;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email not found in Google token",
      });
    }

    const timestamp = moment().format("YYYY-MM-DD HH:mm:ss");

    // Check if user already exists
    const checkSql =
      "SELECT user_id, fullname, email FROM mobileusers WHERE email = ?";

    db.query(checkSql, [email], (checkErr, users) => {
      if (checkErr) {
        return res.status(500).json({
          success: false,
          message: "Database error",
        });
      }

      // 🔐 Existing user → LOGIN
      if (users.length > 0) {
        const user = users[0];

        const jwtToken = jwt.sign(
          { id: user.user_id, email: user.email },
          process.env.JWT_SECRET,
          { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
        );

        return res.status(200).json({
          success: true,
          message: "Login successful",
          token: jwtToken,
          user: {
            id: user.user_id,
            fullname: user.fullname,
            email: user.email,
            picture,
          },
        });
      }

      // 🆕 New user → SIGNUP
      const insertSql = `
        INSERT INTO mobileusers 
        (fullname, email, google_id, userimage, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `;

      db.query(
        insertSql,
        [name, email, sub, picture, timestamp, timestamp],
        (insertErr, result) => {
          if (insertErr) {
            return res.status(500).json({
              success: false,
              message: "Database error",
            });
          }

          const jwtToken = jwt.sign(
            { id: result.insertId, email },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
          );

          return res.status(201).json({
            success: true,
            message: "Signup successful",
            token: jwtToken,
            user: {
              id: result.insertId,
              fullname: name,
              email,
              picture,
            },
          });
        }
      );
    });
  } catch (err) {
    console.error("Google token verify failed:", err);
    return res.status(401).json({
      success: false,
      message: "Invalid Google token",
    });
  }
};
