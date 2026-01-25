import express from "express";
import jwt from "jsonwebtoken";
import db from "../../config/dbconnect.js";
import moment from "moment";
import { sendOtpSMS } from "../../utils/sendOtpSMS.js";

const router = express.Router();

/* ======================================================
   OTP STORE (Use Redis in production)
====================================================== */
const otpStore = new Map();

const generateOtp = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

/* ======================================================
   SEND OTP (SMS)
====================================================== */
router.post("/send-otp", async (req, res) => {
  try {
    const { contact } = req.body;

    if (!/^\d{10}$/.test(contact)) {
      return res.status(400).json({ message: "Invalid contact number" });
    }

    const otp = generateOtp();

    otpStore.set(contact, {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    });

    await sendOtpSMS(contact, otp);

    return res.json({
      success: true,
      message: "OTP sent successfully",
    });
  } catch (err) {
    console.error("Send OTP Error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to send OTP",
    });
  }
});

/* ======================================================
   VERIFY OTP (LOGIN / REGISTER)
====================================================== */
router.post("/verify-otp", async (req, res) => {
  try {
    const { contact, otp, fullname } = req.body;

    if (!/^\d{10}$/.test(contact) || !otp) {
      return res.status(400).json({ message: "Invalid request" });
    }

    const record = otpStore.get(contact);

    if (!record) {
      return res.status(400).json({ message: "OTP expired or invalid" });
    }

    if (Date.now() > record.expiresAt) {
      otpStore.delete(contact);
      return res.status(400).json({ message: "OTP expired" });
    }

    if (record.otp !== otp) {
      return res.status(401).json({ message: "Invalid OTP" });
    }

    otpStore.delete(contact);

    /* ---------------- CHECK USER ---------------- */
    const user = await new Promise((resolve, reject) => {
      db.query(
        "SELECT * FROM guestUsers WHERE contact = ? AND loginstatus = 'Active'",
        [contact],
        (err, results) => {
          if (err) reject(err);
          resolve(results[0]);
        }
      );
    });

    const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
    let userData;

    /* ---------------- REGISTER ---------------- */
    if (!user) {
      const insertResult = await new Promise((resolve, reject) => {
        db.query(
          `INSERT INTO guestUsers 
           (fullname, contact, loginstatus, created_at, updated_at)
           VALUES (?, ?, 'Active', ?, ?)`,
          [fullname?.trim() || "Guest User", contact, currentdate, currentdate],
          (err, result) => {
            if (err) reject(err);
            resolve(result);
          }
        );
      });

      userData = {
        id: insertResult.insertId,
        fullname: fullname?.trim() || "Guest User",
        contact,
        role: "Guest User",
      };
    } else {
      userData = {
        id: user.id,
        fullname: user.fullname,
        contact: user.contact,
        role: "Guest User",
      };
    }

    /* ---------------- JWT ---------------- */
    const token = jwt.sign(
      { id: userData.id, contact: userData.contact },
      process.env.JWT_SECRET,
      { expiresIn: "10d" }
    );

    /* ---------------- SESSION ---------------- */
    req.session.user = userData;

    /* ---------------- COOKIE ---------------- */
    res.cookie("userToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 10 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      success: true,
      message: "Authentication Successful",
      token,
      user: userData,
    });
  } catch (err) {
    console.error("Verify OTP Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/* ======================================================
   SESSION DATA
====================================================== */
router.get("/session-data", (req, res) => {
  if (req.session?.user) {
    return res.json({ user: req.session.user });
  }
  return res.status(401).json({ message: "No active session" });
});

/* ======================================================
   LOGOUT
====================================================== */
router.post("/logout", (req, res) => {
  res.clearCookie("userToken");

  req.session?.destroy(() => {
    return res.json({ message: "Logout successful" });
  });
});

export default router;
