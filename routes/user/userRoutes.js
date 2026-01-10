import express from "express";
import jwt from "jsonwebtoken";
import db from "../../config/dbconnect.js";
import moment from "moment";

const router = express.Router();

/* ======================================================
   OTP STORE (Use Redis in production)
====================================================== */
const otpStore = new Map();

const generateOtp = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

/* ======================================================
   SEND OTP
====================================================== */
import axios from "axios";

router.post("/send-otp", async (req, res) => {
  try {
    const { contact } = req.body;

    if (!/^\d{10}$/.test(contact)) {
      return res.status(400).json({ message: "Invalid contact number" });
    }

    const otp = generateOtp();

    otpStore.set(contact, {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 min
    });

    // WhatsApp OTP Message
    const message = `Your Reparv OTP is ${otp}. Valid for 5 minutes.`;

    // Kinex API Call
    const response = await axios.get(
      "http://wapi.kinextechnologies.in/wapp/api/send",
      {
        params: {
          apikey: process.env.KINEX_API_KEY,
          mobile: contact,
          msg: message,
        },
      }
    );

    // Optional: log response for debugging
    console.log("Kinex Response:", response.data);

    return res.json({ message: "OTP sent successfully" });
  } catch (err) {
    console.error("Send OTP Error:", err);
    res.status(500).json({ message: "Failed to send OTP" });
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

    let userData;
    const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");

    /* ---------------- REGISTER IF NOT EXISTS ---------------- */
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
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "JWT secret not configured" });
    }

    const token = jwt.sign(
      { id: userData.id, contact: userData.contact },
      process.env.JWT_SECRET,
      { expiresIn: "10d" }
    );

    /* ---------------- SESSION ---------------- */
    if (!req.session) {
      return res.status(500).json({ message: "Session not configured" });
    }

    req.session.user = userData;

    /* ---------------- COOKIE ---------------- */
    res.cookie("userToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 10 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      message: "Authentication successful",
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
    return res.json({
      message: "Session Active",
      user: req.session.user,
    });
  }
  return res.status(401).json({ message: "No active session" });
});

/* ======================================================
   LOGOUT
====================================================== */
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
