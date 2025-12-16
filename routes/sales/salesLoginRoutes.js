import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import db from "../../config/dbconnect.js";

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const { emailOrUsername, password } = req.body;

    if (!emailOrUsername || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "Server misconfiguration: JWT secret is missing." });
    }

    const user = await new Promise((resolve, reject) => {
      db.query(
        `SELECT * FROM salespersons 
         WHERE (username = ? OR email = ?) 
         AND loginstatus = 'Active'`,
        [emailOrUsername, emailOrUsername], 
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
      return res.status(401).json({ message: "Wrong Password" });
    }

    //  Generate JWT Token
    const token = jwt.sign({ id: user.salespersonsid, username: user.username, contact: user.contact, email: user.email, adharId: user.adharno, state: user.state, city: user.city, projectpartnerid: user.projectpartnerid, }, process.env.JWT_SECRET, {
      expiresIn: "10d",
    });

    // Ensure session middleware is active
    if (!req.session) {
      return res.status(500).json({ message: "Session middleware is not configured properly." });
    }

    req.session.user = {
      id: user.salespersonsid,
      username: user.username,
      email: user.email,
      name: user.fullname,
      contact: user.contact,
      adharId: user.adharno,
      role: "Sales Person",
      state: user.state,
      city: user.city,
      projectpartnerid: user.projectpartnerid,
    };

    //  Set Secure Cookie in Production
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 10 * 24 * 60 * 60 * 1000,
    };

    res.cookie("salesToken", token, cookieOptions);

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
  res.clearCookie("salesToken", { 
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

// Get Password
router.post("/login/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    // Email required
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Email regex validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    // Fetch user
    const user = await new Promise((resolve, reject) => {
      db.query(
        "SELECT * FROM salespersons WHERE email = ?",
        [email],
        (err, results) => {
          if (err) {
            //reject({ status: 500, message: "Database error" });
            reject({
              status: 500,
              message: err.message,
              code: err.code,
            });
          } else if (results.length === 0) {
            reject({
              status: 404,
              message: "Account not found with this email",
            });
          } else {
            resolve(results[0]);
          }
        }
      );
    });

    const newPassword = generatePassword();

    // Hash password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password in DB (awaited)
    await new Promise((resolve, reject) => {
      db.query(
        "UPDATE salespersons SET password = ? WHERE email = ?",
        [hashedPassword, email],
        (err, result) => {
          if (err) {
            reject({ status: 500, message: "Password update failed" });
          } else {
            resolve(result);
          }
        }
      );
    });

    // Send password email (pass password)
    await sendForgotPasswordMail(email, {
      ...user,
      password: newPassword,
    });

    // Success response
    return res.status(200).json({
      message: "New password sent successfully on your email",
    });
  } catch (error) {
    console.error("Password Generation Failed:", error);
    return res
      .status(error.status || 500)
      .json({ message: error.message || "Internal server error" });
  }
});

export default router;