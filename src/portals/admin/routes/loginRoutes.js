import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import db from "#db";
import sendForgotPasswordMail from "#utils/sendForgotPasswordMail.js";
import {
  getAdminTokenCookieOptions,
  getAdminTokenClearOptions,
} from "#utils/adminAuthCookie.js";

const router = express.Router();

/**
 * One-time / dev admin bootstrap: creates a row in `users` with bcrypt password.
 * Requires ADMIN_SETUP_SECRET in env; send same value in header x-admin-setup-secret.
 * Remove secret from production .env after use.
 */
router.post("/setup/create-user", async (req, res) => {
  try {
    if (!process.env.ADMIN_SETUP_SECRET) {
      return res.status(503).json({
        message:
          "Admin setup is disabled. Set ADMIN_SETUP_SECRET in reparv-server/.env and restart the server.",
      });
    }
    const secret =
      req.headers["x-admin-setup-secret"] || req.body?.setupSecret;
    if (secret !== process.env.ADMIN_SETUP_SECRET) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const {
      name,
      username,
      email,
      password,
      contact = "",
      adharno = "",
      status = "active",
      role = "admin",
    } = req.body;

    if (!name || !username || !email || !password) {
      return res.status(400).json({
        message: "name, username, email and password are required",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await new Promise((resolve, reject) => {
      db.query(
        `INSERT INTO users (name, username, email, password, contact, adharno, status, role)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, username, email, hashedPassword, contact, adharno, status, role],
        (err, result) => {
          if (err) {
            if (err.code === "ER_DUP_ENTRY") {
              return reject({
                status: 409,
                message: "Email or username already exists",
              });
            }
            return reject(err);
          }
          resolve(result);
        },
      );
    });

    return res.status(201).json({ message: "Admin user created successfully" });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error("setup/create-user:", error);
    return res.status(500).json({
      message: "Failed to create user",
      error: error.message,
    });
  }
});

// User Login Route
router.post("/login", async (req, res) => {
  try {
    const { emailOrUsername, password } = req.body;

    if (!emailOrUsername || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    //  Query the database for either email OR username
    const user = await new Promise((resolve, reject) => {
      db.query(
        "SELECT * FROM users WHERE email = ? OR username = ?",
        [emailOrUsername, emailOrUsername],
        (err, results) => {
          if (err)
            reject({ status: 500, message: "Database error", error: err });
          else if (results.length === 0)
            reject({ status: 401, message: "Invalid Email | Username" });
          else resolve(results[0]);
        }
      );
    });

    //  Compare password: bcrypt hash, or legacy plain text (upgrade to hash on success)
    try {
      const stored = user?.password ?? "";
      const looksLikeBcrypt =
        typeof stored === "string" &&
        stored.length >= 59 &&
        stored.startsWith("$2");

      let isMatch = false;
      if (looksLikeBcrypt) {
        isMatch = await bcrypt.compare(password, stored);
      } else {
        isMatch = password === stored;
        if (isMatch) {
          const hashedPassword = await bcrypt.hash(password, 10);
          await new Promise((resolve, reject) => {
            db.query(
              "UPDATE users SET password = ? WHERE id = ?",
              [hashedPassword, user.id],
              (err) => (err ? reject(err) : resolve()),
            );
          });
        }
      }

      if (!isMatch) {
        return res.status(401).json({ message: "Wrong Password try again!" });
      }
    } catch (error) {
      return res
        .status(500)
        .json({ message: "Password comparison error", error });
    }

    //  Generate JWT Token
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        email: user.email,
        adharId: user.adharno,
        name: user.name,
        contact: user.contact,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "10d",
      },
    );

    //  Store session data
    req.session.user = {
      id: user.id,
      email: user.email,
      username: user.username, // Added username field
      name: user.name,
      contact: user.contact,
      role: user.role,
    };

    res.cookie("adminToken", token, getAdminTokenCookieOptions());

    return res.json({
      message: "Login successful",
      user: req.session.user,
    });
  } catch (error) {
    console.error("Login Error:", error);
    return res
      .status(error.status || 500)
      .json({ message: error.message || "Internal server error" });
  }
});

//  Get Current User's Session Data (express-session; optional legacy)
router.get("/session-data", (req, res) => {
  if (req.session.user) {
    res.json({ message: "Session Active", user: req.session.user });
  } else {
    res.status(401).json({ message: "No active session" });
  }
});

/** Current admin from httpOnly JWT cookie (primary auth check for the admin SPA). */
router.get("/auth/me", (req, res) => {
  const token = req.cookies?.adminToken;
  if (!token) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return res.json({
      user: {
        id: decoded.id,
        username: decoded.username,
        email: decoded.email,
        name: decoded.name,
        contact: decoded.contact,
        role: decoded.role,
      },
    });
  } catch {
    res.clearCookie("adminToken", getAdminTokenClearOptions());
    return res.status(401).json({ message: "Invalid or expired session" });
  }
});

//  Logout Route
router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: "Logout failed" });
    }
    res.clearCookie("adminToken", getAdminTokenClearOptions());
    console.log("Logout Successfully");
    return res.json({ message: "Logout successful." });
  });
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
        "SELECT * FROM users WHERE email = ?",
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

    // Generate random password
    const generatePassword = () => {
      const chars =
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()";
      let password = "";
      for (let i = 0; i < 8; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return password;
    };

    const newPassword = generatePassword();

    // Hash password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password in DB (awaited)
    await new Promise((resolve, reject) => {
      db.query(
        "UPDATE users SET password = ? WHERE email = ?",
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
