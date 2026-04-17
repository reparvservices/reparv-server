import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import db from "#db";

const router = express.Router();

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
        `SELECT * FROM onboardingpartner 
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
    const token = jwt.sign({ id: user.partnerid, username: user.username, contact: user.contact, email: user.email, adharId: user.adharno }, process.env.JWT_SECRET, {
      expiresIn: "10d",
    });

    //  Ensure session middleware is active
    if (!req.session) {
      return res.status(500).json({ message: "Session middleware is not configured properly." });
    }

    req.session.user = {
      id: user.partnerid,
      username: user.username,
      email: user.email,
      name: user.fullname,
      contact: user.contact,
      adharId: user.adharno,
      role: "Onboarding Partner",
    };

    //  Set Secure Cookie in Production
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 10 * 24 * 60 * 60 * 1000,
    };

    res.cookie("onboardingToken", token, cookieOptions);

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

// Logout Route
router.post("/logout", (req, res) => {
  res.clearCookie("onboardingToken", { 
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