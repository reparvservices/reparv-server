import db from "#db";
import moment from "moment-timezone";
import { deleteFromS3, uploadToS3 } from "#utils/imageUpload.js";
import { convertSingleImageToWebp } from "#utils/convertSingleImageToWebp.js";
import jwt from "jsonwebtoken";
import { sendOtpSMS } from "#utils/sendOtpSMS.js";

export const getProfile = (req, res) => {
  const Id = req.guestUser?.id;
  if (!Id) return res.status(400).json({ message: "Unauthorized User" });

  const sql = `SELECT * FROM guestUsers WHERE id = ?`;

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching profile:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0)
      return res.status(404).json({ message: "User not found" });

    res.json(result[0]);
  });
};

export const editProfile = async (req, res) => {
  const userId = req.guestUser?.id;
  if (!userId) {
    return res.status(400).json({ message: "Invalid User ID" });
  }

  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const { fullname, contact, email, address, state, city } = req.body;

  if (!fullname || !email || !address || !state || !city) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    /* ---------- FETCH EXISTING USER ---------- */
    const existingResult = await new Promise((resolve, reject) => {
      db.query(
        "SELECT userimage FROM guestUsers WHERE id = ?",
        [userId],
        (err, result) => (err ? reject(err) : resolve(result))
      );
    });

    if (existingResult.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    let finalImagePath = existingResult[0].userimage;

    /* ---------- COMPRESS + UPLOAD NEW IMAGE ---------- */
    if (req.file) {
      const convertedImage = await convertSingleImageToWebp(req.file);
      finalImagePath = await uploadToS3(convertedImage);

      // 🗑 delete old image from S3
      if (existingResult[0].userimage) {
        await deleteFromS3(existingResult[0].userimage);
      }
    }

    /* ---------- UPDATE PROFILE ---------- */
    const updateSql = `
      UPDATE guestUsers SET 
        fullname = ?, 
        email = ?, 
        address = ?, 
        state = ?, 
        city = ?, 
        userimage = ?, 
        updated_at = ? 
      WHERE id = ?
    `;

    const updateValues = [
      fullname,
      email,
      address,
      state,
      city,
      finalImagePath,
      currentdate,
      userId,
    ];

    await new Promise((resolve, reject) => {
      db.query(updateSql, updateValues, (err, result) =>
        err ? reject(err) : resolve(result)
      );
    });

    return res.status(200).json({
      message: "Profile updated successfully",
      userImage: finalImagePath,
    });
  } catch (err) {
    console.error("Error updating profile:", err);
    return res.status(500).json({
      message: "Internal server error",
      error: err,
    });
  }
};

export const changeContact = async (req, res) => {
  const userId = req.guestUser?.id;
  const { contact } = req.body;

  if (!userId) return res.status(400).json({ message: "Invalid User ID" });
  if (!contact) return res.status(400).json({ message: "Contact is required" });

  try {
    const existingResult = await new Promise((resolve, reject) => {
      db.query(
        "SELECT contact FROM guestUsers WHERE id = ?",
        [userId],
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
    });

    if (existingResult.length === 0)
      return res.status(404).json({ message: "User not found" });

    await new Promise((resolve, reject) => {
      db.query(
        "UPDATE guestUsers SET contact = ? WHERE id = ?",
        [contact, userId],
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
    });

    res.status(200).json({ message: "Contact changed successfully" });
  } catch (err) {
    console.error("Error changing contact:", err);
    res.status(500).json({ message: "Internal server error", error: err });
  }
};

/* ======================================================
   CHANGE CONTACT WITH OTP VERIFICATION
   The new number must be verified before it replaces the
   current one, and it can't belong to another account
   (OTP login looks users up by contact).
====================================================== */
const CONTACT_OTP_TTL_MS = 5 * 60 * 1000;
const CONTACT_OTP_RESEND_MS = 30 * 1000;
const CONTACT_OTP_MAX_ATTEMPTS = 5;

// In-memory like the login OTP store (use Redis when running multiple instances)
const contactOtpStore = new Map();
const contactOtpKey = (userId, contact) => `${userId}:${contact}`;

const findOtherUserWithContact = (contact, userId) =>
  new Promise((resolve, reject) => {
    db.query(
      "SELECT id FROM guestUsers WHERE contact = ? AND id != ? LIMIT 1",
      [contact, userId],
      (err, result) => (err ? reject(err) : resolve(result[0])),
    );
  });

export const sendContactChangeOtp = async (req, res) => {
  const userId = req.guestUser?.id;
  const contact = String(req.body?.contact || "").trim();

  if (!userId) return res.status(401).json({ message: "Please login again" });
  if (!/^[6-9]\d{9}$/.test(contact)) {
    return res.status(400).json({ message: "Enter a valid 10-digit mobile number" });
  }

  try {
    const current = await new Promise((resolve, reject) => {
      db.query("SELECT contact FROM guestUsers WHERE id = ?", [userId], (err, result) =>
        err ? reject(err) : resolve(result[0]),
      );
    });
    if (!current) return res.status(404).json({ message: "User not found" });
    if (current.contact === contact) {
      return res.status(400).json({ message: "This is already your phone number" });
    }

    if (await findOtherUserWithContact(contact, userId)) {
      return res
        .status(409)
        .json({ message: "This number is already linked to another account" });
    }

    const key = contactOtpKey(userId, contact);
    const existing = contactOtpStore.get(key);
    if (existing && Date.now() - existing.sentAt < CONTACT_OTP_RESEND_MS) {
      const wait = Math.ceil((CONTACT_OTP_RESEND_MS - (Date.now() - existing.sentAt)) / 1000);
      return res.status(429).json({ message: `Please wait ${wait}s before requesting a new OTP` });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    contactOtpStore.set(key, {
      otp,
      sentAt: Date.now(),
      expiresAt: Date.now() + CONTACT_OTP_TTL_MS,
      attempts: 0,
    });

    await sendOtpSMS(contact, otp);

    return res.json({ success: true, message: "OTP sent to your new number" });
  } catch (err) {
    console.error("Send contact change OTP error:", err);
    return res.status(500).json({ message: "Failed to send OTP" });
  }
};

export const verifyContactChangeOtp = async (req, res) => {
  const userId = req.guestUser?.id;
  const contact = String(req.body?.contact || "").trim();
  const otp = String(req.body?.otp || "").trim();

  if (!userId) return res.status(401).json({ message: "Please login again" });
  if (!/^[6-9]\d{9}$/.test(contact) || !/^\d{6}$/.test(otp)) {
    return res.status(400).json({ message: "Enter the 6-digit OTP" });
  }

  const key = contactOtpKey(userId, contact);
  const record = contactOtpStore.get(key);

  if (!record || Date.now() > record.expiresAt) {
    contactOtpStore.delete(key);
    return res.status(400).json({ message: "OTP expired. Please request a new one" });
  }

  if (record.otp !== otp) {
    record.attempts += 1;
    if (record.attempts >= CONTACT_OTP_MAX_ATTEMPTS) {
      contactOtpStore.delete(key);
      return res.status(429).json({ message: "Too many wrong attempts. Please request a new OTP" });
    }
    return res.status(401).json({ message: "Incorrect OTP" });
  }

  try {
    // Re-check: the number may have been taken since the OTP was sent
    if (await findOtherUserWithContact(contact, userId)) {
      contactOtpStore.delete(key);
      return res
        .status(409)
        .json({ message: "This number is already linked to another account" });
    }

    await new Promise((resolve, reject) => {
      db.query(
        "UPDATE guestUsers SET contact = ?, updated_at = ? WHERE id = ?",
        [contact, moment().format("YYYY-MM-DD HH:mm:ss"), userId],
        (err, result) => (err ? reject(err) : resolve(result)),
      );
    });
    contactOtpStore.delete(key);

    // Re-issue the login token so requests that read the contact from it stay correct
    const { iat, exp, ...claims } = req.guestUser;
    const token = jwt.sign({ ...claims, contact }, process.env.JWT_SECRET, {
      expiresIn: "10d",
    });
    res.cookie("userToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 10 * 24 * 60 * 60 * 1000,
    });
    if (req.session?.user) req.session.user.contact = contact;

    return res.json({
      success: true,
      message: "Phone number updated successfully",
      contact,
      token,
    });
  } catch (err) {
    console.error("Verify contact change OTP error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
