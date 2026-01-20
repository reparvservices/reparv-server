import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import db from "../../config/dbconnect.js";
import {
  sendOtp,
  verifyOtp,
  resetPassword,
} from "../../controllers/builderApp/profileController.js";

const router = express.Router();

router.post("/login", async (req, res) => {
  console.log("build");

  try {
    const { emailOrUsername, password } = req.body;

    if (!emailOrUsername || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (!process.env.JWT_SECRET) {
      return res
        .status(500)
        .json({ message: "Server misconfiguration: JWT secret is missing." });
    }

    const user = await new Promise((resolve, reject) => {
      db.query(
        `SELECT * FROM builders 
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
        },
      );
    });

    //  Verify Password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Wrong Password" });
    }

    //  Generate JWT Token
    const token = jwt.sign(
      {
        id: user.builderid,
        username: user.username,
        email: user.email,
        adharId: user.uid,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "10d",
      },
    );

    // Ensure session middleware is active
    if (!req.session) {
      return res
        .status(500)
        .json({ message: "Session middleware is not configured properly." });
    }

    req.session.user = {
      id: user.builderid,
      username: user.username,
      email: user.email,
      contact_person: user.contact_person,
      contact: user.contact,
      role: "Builder",
    };

    //  Set Secure Cookie in Production
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 10 * 24 * 60 * 60 * 1000,
    };

    res.cookie("token", token, cookieOptions);

    return res.json({
      message: "Login successful",
      token,
      user: req.session.user,
    });
  } catch (error) {
    console.error("Login Error:", error);
    return res
      .status(500)
      .json({ message: error.message || "Internal server error" });
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
  res.clearCookie("token", {
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

router.get("/send-otp/:id", sendOtp);
router.post("/verify-otp", verifyOtp);
router.post("/reset-password", resetPassword);
export default router;
