import db from "../../config/dbconnect.js";
import bcrypt from "bcryptjs";
import { uploadToS3 } from "../../utils/imageUpload.js";
import sendEmail from "../../utils/nodeMailer.js";
import { sendOtpSMS } from "../../utils/sendOtpSMS.js";
import moment from "moment";
export const add = async (req, res) => {
  try {
    const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");

    let {
      fullname,
      contact,
      email,
      username,
      intrest,
      refrence,
      state,
      city,
      pincode,
      experience,
      rerano,
      password,
    } = req.body;

    if (!fullname || !contact || !email || !intrest) {
      return res.status(400).json({ message: "Required fields missing" });
    }

    email = email?.toLowerCase();
    if (!username || username.trim() === "") username = null;

    /* ---------------- Referral Code ---------------- */

    const createReferralCode = () => {
      const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      let code = "";
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return "REF-" + code;
    };

    const generateUniqueReferralCode = () => {
      return new Promise((resolve, reject) => {
        const code = createReferralCode();

        db.query(
          "SELECT referral FROM projectpartner WHERE referral = ?",
          [code],
          (err, results) => {
            if (err) return reject(err);

            if (results.length > 0) {
              resolve(generateUniqueReferralCode());
            } else {
              resolve(code);
            }
          },
        );
      });
    };

    /* ---------------- Upload Business Logo ---------------- */

    const logoFiles = req.files?.["businessLogo"] || [];
    let businessLogo = null;

    if (logoFiles.length > 0) {
      businessLogo = await uploadToS3(logoFiles[0]);
    }

    /* ---------------- Duplicate Check ---------------- */

    const checkSql =
      "SELECT * FROM projectpartner WHERE contact=? OR email=? OR username=?";

    db.query(checkSql, [contact, email, username], async (checkErr, rows) => {
      if (checkErr) {
        return res.status(500).json({
          message: "Database validation error",
          error: checkErr,
        });
      }

      if (rows.length > 0) {
        const dup = rows[0];

        if (dup.contact === contact)
          return res.status(409).json({ message: "Contact already exists" });

        if (dup.email === email)
          return res.status(409).json({ message: "Email already exists" });

        if (dup.username === username)
          return res.status(409).json({ message: "Username already exists" });
      }

      /* ---------------- Referral ---------------- */

      const referralCode = await generateUniqueReferralCode();

      /* ---------------- Password ---------------- */

      let hashedPassword = null;
      let loginstatus = "Inactive";

      if (password) {
        hashedPassword = await bcrypt.hash(password, 10);
        loginstatus = "Active";
      }

      /* ---------------- Insert ---------------- */

      const insertSql = `
        INSERT INTO projectpartner
        (fullname, contact, email, username, intrest, refrence, referral,
        state, city, pincode, experience, rerano, businessLogo,
        password, loginstatus, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      db.query(
        insertSql,
        [
          fullname,
          contact,
          email,
          username,
          intrest,
          refrence,
          referralCode,
          state,
          city,
          pincode,
          experience,
          rerano,
          businessLogo,
          hashedPassword,
          loginstatus,
          currentdate,
          currentdate,
        ],
        async (insertErr, result) => {
          if (insertErr) {
            return res.status(500).json({
              message: "Insert error",
              error: insertErr,
            });
          }

          /* ---------------- Status Update ---------------- */

          db.query(
            "UPDATE projectpartner SET status='Active' WHERE id=?",
            [result.insertId],
            (updateErr) => {
              if (updateErr) {
                console.error("Status update error:", updateErr);
              }
            },
          );

          /* ---------------- Send Email ---------------- */

          if (password) {
            try {
              await sendEmail(
                email,
                username,
                password,
                "Project Partner",
                "https://projectpartner.reparv.in",
              );
            } catch (err) {
              console.log("Email error:", err);
            }
          }

          return res.status(201).json({
            message: "Project Partner Added Successfully",
            id: result.insertId,
          });
        },
      );
    });
  } catch (err) {
    console.error("Add Partner Error:", err);
    res.status(500).json({ message: "Server error", error: err });
  }
};
// 🔥 Generate OTP
const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000);
};

// ===============================
// SEND OTP
// ===============================

export const sendProjectPartnerOtp = async (req, res) => {
  const { mobile } = req.body;

  console.log("Mobile:", mobile);

  if (!mobile) {
    return res.status(400).json({
      success: false,
      message: "Mobile number is required",
    });
  }

  const checkQuery = "SELECT * FROM projectpartner WHERE contact = ?";

  db.query(checkQuery, [mobile], (err, result) => {
    if (err) {
      console.log("DB Error:", err);
      return res.status(500).json({ message: "Database error" });
    }

    if (result.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Mobile number not registered",
      });
    }

    const otp = generateOtp(); // no await needed

    const updateQuery = "UPDATE projectpartner SET otp = ? WHERE contact = ?";

    db.query(updateQuery, [otp, mobile], async (err) => {
      if (err) {
        console.log("OTP Store Error:", err);
        return res.status(500).json({
          success: false,
          message: "Failed to store OTP",
        });
      }

      try {
        // 🔥 SEND OTP SMS
        const smsResponse = await sendOtpSMS(mobile, otp);

        if (!smsResponse.success) {
          return res.status(500).json({
            success: false,
            message: "OTP generated but SMS failed",
            error: smsResponse.error,
          });
        }

        return res.status(200).json({
          success: true,
          message: "OTP sent successfully",
        });
      } catch (smsError) {
        console.log("SMS Error:", smsError);

        return res.status(500).json({
          success: false,
          message: "Failed to send OTP",
        });
      }
    });
  });
};

// ===============================
// VERIFY OTP
// ===============================

export const verifyProjectPartnerOtp = (req, res) => {
  const { mobile, otp } = req.body;
  console.log(mobile, "dd", otp);

  if (!mobile || !otp) {
    return res.status(400).json({
      success: false,
      message: "Mobile and OTP required",
    });
  }

  const query = "SELECT * FROM projectpartner WHERE contact = ? AND otp = ?";

  db.query(query, [mobile, otp], (err, result) => {
    if (err) {
      console.log(err);
      return res.status(500).json({
        success: false,
        message: "Database error",
      });
    }

    if (result.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    const clearOtpQuery =
      "UPDATE projectpartner SET otp = NULL WHERE contact = ?";

    db.query(clearOtpQuery, [mobile], (err) => {
      if (err) {
        console.log(err);
      }

      console.log(result[0]);

      return res.status(200).json({
        success: true,
        message: "OTP verified successfully",
        user: result[0],
        token: result[0].id,
      });
    });
  });
};
