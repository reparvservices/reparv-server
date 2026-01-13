import moment from "moment";
import db from "../../config/dbconnect.js";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { OAuth2Client } from 'google-auth-library';


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
    const { fullname, email, contact } = req.body;
    const userimage = req.file ? `/uploads/${req.file.filename}` : null;
    const timestamp = moment().format("YYYY-MM-DD HH:mm:ss");

    if (!fullname || !email || !contact) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    let sql = `
      UPDATE mobileusers
      SET fullname = ?, email = ?, updated_at = ?
    `;
    const params = [fullname, email, timestamp];

    if (userimage) {
      sql += `, userimage = ?`;
      params.push(userimage);
    }

    sql += ` WHERE contact = ?`;
    params.push(contact);

    db.query(sql, params, err => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: "Database error",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        data: {
          fullname,
          email,
          contact,
          userimage,
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


const client = new OAuth2Client(process.env.GOOGLELOGIN_CLIENT_ID);

export const googleLogin = async (req, res) => {
  try {
    const { token } = req.body;

    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLELOGIN_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    const { email, name, sub } = payload;

    // create/find user in DB here

    const appToken = jwt.sign(
      { email, name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token: appToken,
      user: { email, name },
    });

  } catch (err) {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

