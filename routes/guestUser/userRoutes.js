import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import db from "../../config/dbconnect.js";
import sendEmail from "../../utils/nodeMailer.js";
import moment from "moment";

const router = express.Router();

// Helper: Extract name from email
const extractNameFromEmail = (email) => {
  if (!email) return "";
  const namePart = email.split("@")[0];
  const lettersOnly = namePart.match(/[a-zA-Z]+/);
  if (!lettersOnly) return "";
  const name = lettersOnly[0].toLowerCase();
  return name.charAt(0).toUpperCase() + name.slice(1);
};

// Helper: Generate random password
const generatePassword = () => {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()";
  let password = "";
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

// Route: Register Guest User
router.post("/register", async (req, res) => {

  try {
    const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
    const { fullname, contact, email, password } = req.body;

    if (!fullname || !contact || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Check duplicate
    const existingUser = await new Promise((resolve, reject) => {
      db.query(
        `SELECT * FROM guestUsers WHERE email = ? OR contact = ?`,
        [email, contact],
        (err, results) => {
          if (err) return reject(err);
          resolve(results[0]);
        }
      );
    });

    if (existingUser) {
      return res
        .status(409)
        .json({ message: "User already exists with this email or contact." });
    }

    // Generate username and password
    const username = extractNameFromEmail(email);
    const rawPassword = password
    let hashedPassword;

    try {
      hashedPassword = await bcrypt.hash(rawPassword, 10);
    } catch (hashErr) {
      console.error("Error hashing password:", hashErr);
      return res.status(500).json({ message: "Failed to hash password" });
    }

    // Insert into DB
    const insertedUser = await new Promise((resolve, reject) => {
      db.query(
        `INSERT INTO guestUsers (fullname, contact, email, username, password, loginstatus, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?,?)`,
        [fullname, contact, email, username, hashedPassword, "Active", currentdate, currentdate],
        (err, result) => {
          if (err) return reject(err);
          resolve({ id: result.insertId, fullname, contact, email, username });
        }
      );
    });

    // Send email
    try {
      await sendEmail(
        email,
        username,
        rawPassword,
        "Guest User",
        "https://users.reparv.in"
      );
    } catch (emailErr) {
      console.error("Error sending email:", emailErr);
      return res.status(500).json({ message: "Registration failed: Email not sent" });
    }

    return res.status(201).json({
      message: "Registration successful. Check your email for login credentials.",
      user: insertedUser,
    });

  } catch (error) {
    console.error("Register Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

//  User Login Route (Supports Email or Username)
router.post("/login", async (req, res) => {
  try {
    const { emailOrUsername, password } = req.body;

    if (!emailOrUsername || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "Server misconfiguration: JWT secret is missing." });
    }

    //  Query for both email and username
    const user = await new Promise((resolve, reject) => {
      db.query(
        `SELECT * FROM guestUsers 
         WHERE (username = ? OR email = ?) 
         AND loginstatus = 'Active'`,
        [emailOrUsername, emailOrUsername], // Check both email & username
        (err, results) => {
          if (err) {
            console.error("Database Error:", err);
            return reject(new Error("Database error"));
          }
          if (results.length === 0) {
            return reject(new Error("Invalid Email | Username"));
          }
          resolve(results[0]);
        }
      );
    });

    //  Verify Password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Wrong Password try again" });
    }

    //  Generate JWT Token
    const token = jwt.sign({ id: user.id, username: user.username, email: user.email, adharId: user.adharno }, process.env.JWT_SECRET, {
      expiresIn: "10d",
    });

    // Ensure session middleware is active
    if (!req.session) {
      return res.status(500).json({ message: "Session middleware is not configured properly." });
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.fullname,
      contact: user.contact,
      adharId: user.adharno,
      role: "Guest User",
    };

    //  Set Secure Cookie in Production
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 10 * 24 * 60 * 60 * 1000,
    };

    res.cookie("userToken", token, cookieOptions);

    return res.json({
      message: "Login successful",
      token,
      user: req.session.user,
    });

  } catch (error) {
    console.error("Login Error:", error);
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
});

//  Get Current User's Session Data
router.get("/session-data", (req, res) => {
  if (req.session && req.session.user) {
    res.json({ message: "Session Active", user: req.session.user });
  } else {
    res.status(401).json({ message: "No active session" });
  }
});

//  Logout Route
router.post("/logout", (req, res) => {
  res.clearCookie("userToken", { 
    httpOnly: true, 
    secure: process.env.NODE_ENV === "production", 
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });

  if (req.session) {
    req.session.destroy((err) => {
      if (err) {
        console.error("Logout Error:", err);
        return res.status(500).json({ message: "Logout failed" });
      }
      return res.json({ message: "Logout successful" });
    });
  } else {
    return res.json({ message: "Logout successful" });
  }
});

export default router;