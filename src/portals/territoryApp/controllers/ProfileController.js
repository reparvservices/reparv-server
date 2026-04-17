import db from "#db";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import crypto from "crypto";
import { convertSingleImageToWebp } from "#utils/convertSingleImageToWebp.js";
import { uploadToS3 } from "#utils/imageUpload.js";

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
// ── Helper: upload one file field to S3 ─────────────────────
const uploadImageField = async (fileObj) => {
  if (!fileObj) return null;
  try {
    let uploadFile = fileObj;
    if (fileObj.mimetype?.startsWith("image/")) {
      const compressed = await convertSingleImageToWebp(fileObj);
      if (compressed) uploadFile = compressed;
    }
    const url = await uploadToS3(uploadFile);
    return url;
  } catch (err) {
    console.error("S3 upload error:", err);
    return null;
  }
};

export const loginUser = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  try {
    const sql = `SELECT * FROM territorypartner WHERE email = ?`;
    db.query(sql, [email], (err, result) => {
      if (err) {
        console.error("Error fetching profile:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      if (result.length === 0) {
        return res.status(404).json({ message: "User Not Found" });
      }

      const user = result[0];

      // Compare entered password with hashed password
      bcrypt.compare(password, user.password, (err, isMatch) => {
        if (err) {
          console.error("Bcrypt compare error:", err);
          return res.status(500).json({ message: "Internal error" });
        }

        if (!isMatch) {
          return res.status(401).json({ message: "Invalid password" });
        }

        // // Optional: Remove password before sending response
        // delete user.password;

        console.log("Login successful:", user);

        return res.status(200).json({
          message: "Login successful",
          profile: user,
        });
      });
    });

    // // Send profile data (remove sensitive fields)
    // const profileData = {
    //   id: user.id,
    //   name: user.name,
    //   email: user.email,
    //   // add more fields as needed
    // };
  } catch (err) {
    console.error("eeeeeeeeeee", err.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const sendOtp = async (req, res) => {
  const email = req.params.id;

  //  Check if email exists in territorypartner
  const query = "SELECT * FROM territorypartner WHERE email = ?";
  db.query(query, [email], async (err, results) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).json({ message: "Database error" });
    }

    if (results.length === 0) {
      //  Email not found
      console.log("email");

      return res.status(404).json({ message: "Email not found" });
    }

    //  Email exists, now generate OTP and send email
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
    const ttl = 5 * 60 * 1000; // 5 minutes
    const expires = Date.now() + ttl;

    const data = `${email}.${otp}.${expires}`;
    const secret = process.env.JWT_SECRET; // Move this to process.env in production
    const hash = crypto.createHmac("sha256", secret).update(data).digest("hex");
    const fullHash = `${hash}.${expires}`;

    try {
      const mailOptions = {
        from: `"Reparv Support" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `🔐 Your OTP for Password Reset - Reparv`,
        html: `
              <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <h2 style="color: #0078DB;">Hello,</h2>
          
                <p>We received a request to reset your password for your <strong>Territory Partner Reparv</strong> account.</p>
          
                <p>Your One-Time Password (OTP) is:</p>
          
                <h1 style="color: #0BB501; font-size: 32px;">${otp}</h1>
          
                <p>This OTP is valid for <strong>5 minutes</strong>. Please enter this code in the app to proceed with resetting your password.</p>
          
                <p>If you did not request a password reset, you can safely ignore this email. Your account will remain secure.</p>
          
                <br />
          
                <p>Thanks & regards,</p>
                <p><strong>Team Reparv</strong><br />
                <a href="https://www.reparv.in" target="_blank" style="color: #0078DB;">www.reparv.in</a></p>
          
                <hr style="margin-top: 20px;" />
                <small style="color: #888;">This is an automated message, please do not reply.</small>
              </div>
            `,
      };

      await transporter.sendMail(mailOptions);
      console.log(`Email sent successfully to ${email}`);

      //  Respond with hash
      res.json({ hash: fullHash });
    } catch (error) {
      console.error("Error sending email:", error.message || error);
      res.status(500).json({ message: "Failed to send OTP email" });
    }
  });
};
export const verifyOtp = (req, res) => {
  const { email, otp, hash } = req.body;
  console.log({ email, otp, hash });

  const [hashValue, expires] = hash.split(".");

  if (Date.now() > parseInt(expires)) {
    return res.status(400).json({ message: "OTP expired" });
  }

  const data = `${email}.${otp}.${expires}`;
  const secret = process.env.JWT_SECRET; // Store securely in .env
  const newHash = crypto
    .createHmac("sha256", secret)
    .update(data)
    .digest("hex");
  console.log(newHash, "new", hashValue);

  if (newHash === hashValue) {
    return res.json({ verified: true });
  }

  return res.status(400).json({ message: "Invalid OTP" });
};

//Password Reset
export const resetPassword = async (req, res) => {
  const { email, newPassword } = req.body;

  try {
    // 🔐 Securely hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    //  Update password in your salesperson  table
    const query = `UPDATE territorypartner SET password = ? WHERE email = ?`;
    db.query(query, [hashedPassword, email], (err, result) => {
      if (err) throw err;

      return res.json({
        success: true,
        message: "Password updated successfully. You can now log in.",
      });
    });
  } catch (error) {
    console.error("Password reset error:", error);
    res.status(500).json({ success: false, message: "Something went wrong." });
  }
};

//Send Partner chnage request
export const sendRequest = async (req, res) => {
  try {
    const { territoryid, projectpartnerid, requestreason } = req.body;
    console.log("Incoming body:", req.body);

    const sql = `
      INSERT INTO partner_change_requests ( territoryid, projectpartnerid, requestreason)
      VALUES (?, ?, ?)
    `;

    db.query(
      sql,
      [territoryid, projectpartnerid, requestreason],
      (err, result) => {
        if (err) {
          console.error("Error sending partner change request:", err);
          return res
            .status(500)
            .json({ success: false, message: "Database error" });
        }

        console.log(
          "Partner change request sent successfully, ID:",
          result.insertId,
        );
        res.status(200).json({
          success: true,
          message: "Partner change request submitted successfully",
          requestId: result.insertId,
        });
      },
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Something went wrong!" });
  }
};

export const updateProfileHeader = async (req, res) => {
  const { userId } = req.body;
  console.log(req.body);

  if (!userId)
    return res.status(401).json({ success: false, message: "Unauthorized" });

  const {
    fullname,
    username,
    whatsappNumber,
    experience,
    role_headline,
    bio,
    status,
    // ── basic info fields ──
    companyName,
    location,
    website,
    territories,
    // ── linked / social URLs ──
    linkedinUrl,
    instagramUrl,
    facebookUrl,
    twitterUrl,
    youtubeUrl,
    telegramUrl,
    //business Category
    categories,

    //privacy
    pref_showPosts,
    pref_autoPublish,
    pref_allowTagging,
    pref_allowReposts,
    pref_enableStories,
  } = req.body;

  const fields = [];
  const values = [];

  if (fullname !== undefined) {
    fields.push("fullname = ?");
    values.push(fullname);
  }
  if (username !== undefined) {
    fields.push("username = ?");
    values.push(username);
  }
  if (whatsappNumber !== undefined) {
    fields.push("whatsappNumber = ?");
    values.push(whatsappNumber);
  }
  if (experience !== undefined) {
    fields.push("experience = ?");
    values.push(experience);
  }
  if (role_headline !== undefined) {
    fields.push("displayRole = ?");
    values.push(role_headline);
  }
  if (bio !== undefined) {
    fields.push("bio = ?");
    values.push(bio);
  }
  if (status !== undefined) {
    const normalizedStatus =
      status.trim().toLowerCase() === "active" ? "Active" : "Inactive";
    fields.push("status = ?");
    values.push(normalizedStatus);
  }
  if (companyName !== undefined) {
    fields.push("companyName = ?");
    values.push(companyName);
  }
  if (location !== undefined) {
    fields.push("location = ?");
    values.push(location);
  }
  if (website !== undefined) {
    fields.push("website = ?");
    values.push(website);
  }
  if (territories !== undefined) {
    fields.push("territories = ?");
    values.push(territories);
  }
  // ── linked / social URLs (only pushed if provided) ───────
  if (linkedinUrl !== undefined) {
    fields.push("linkedinUrl = ?");
    values.push(linkedinUrl);
  }
  if (instagramUrl !== undefined) {
    fields.push("instagramUrl = ?");
    values.push(instagramUrl);
  }
  if (facebookUrl !== undefined) {
    fields.push("facebookUrl = ?");
    values.push(facebookUrl);
  }
  if (twitterUrl !== undefined) {
    fields.push("twitterUrl = ?");
    values.push(twitterUrl);
  }
  if (youtubeUrl !== undefined) {
    fields.push("youtubeUrl = ?");
    values.push(youtubeUrl);
  }
  if (telegramUrl !== undefined) {
    fields.push("telegramUrl = ?");
    values.push(telegramUrl);
  }

  //privacy
  if (pref_showPosts !== undefined) {
    fields.push("pref_showPosts = ?");
    values.push(pref_showPosts);
  }
  if (pref_autoPublish !== undefined) {
    fields.push("pref_autoPublish = ?");
    values.push(pref_autoPublish);
  }
  if (pref_allowTagging !== undefined) {
    fields.push("pref_allowTagging = ?");
    values.push(pref_allowTagging);
  }
  if (pref_allowReposts !== undefined) {
    fields.push("pref_allowReposts = ?");
    values.push(pref_allowReposts);
  }
  if (pref_enableStories !== undefined) {
    fields.push("pref_enableStories = ?");
    values.push(pref_enableStories);
  }

  // ── Upload images to S3 if provided ─────────────────────
  const userimageFile = req.files?.userimage?.[0];
  const coverImageFile = req.files?.coverImage?.[0];

  const [userimageUrl, coverImageUrl] = await Promise.all([
    uploadImageField(userimageFile),
    uploadImageField(coverImageFile),
  ]);

  if (userimageUrl) {
    fields.push("userimage = ?");
    values.push(userimageUrl);
  }
  if (coverImageUrl) {
    fields.push("coverImage = ?");
    values.push(coverImageUrl);
  }

  if (categories !== undefined) {
    fields.push("BusinessCategories = ?");
    values.push(categories);
  }
  if (fields.length === 0)
    return res
      .status(400)
      .json({ success: false, message: "No fields to update" });

  fields.push("updated_at = NOW()");
  values.push(userId);

  const sql = `UPDATE territorypartner SET ${fields.join(", ")} WHERE id = ?`;

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("UPDATE HEADER ERROR:", err);
      return res.status(500).json({ success: false, message: "Update failed" });
    }
    if (result.affectedRows === 0)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    return res.status(200).json({
      success: true,
      message: "Profile header updated successfully",
      ...(userimageUrl && { userimage: userimageUrl }),
      ...(coverImageUrl && { coverImage: coverImageUrl }),
    });
  });
};
