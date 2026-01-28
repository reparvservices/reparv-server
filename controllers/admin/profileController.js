import db from "../../config/dbconnect.js";
import moment from "moment";
import bcrypt from "bcryptjs";
import sendEmail from "../../utils/nodeMailer.js";
import { uploadToS3 } from "../../utils/imageUpload.js";

const saltRounds = 10;

export const getProfile = async (req, res) => {
  const Id = req.adminUser?.id; 
  if (!Id) {
    return res.status(400).json({ message: "Unauthorized User" });
  }

  const sql = "SELECT * FROM users WHERE id = ?";

  try {
    const result = await new Promise((resolve, reject) => {
      db.query(sql, [Id], (err, results) => {
        if (err) return reject(err);
        resolve(results);
      });
    });

    if (result.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(result[0]);
    
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({ message: "Database error", error });
  }
};

export const editProfile = async (req, res) => {
  const userId = req.adminUser?.id;
  if (!userId) {
    return res.status(400).json({ message: "Invalid User ID" });
  }

  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const { name, username, contact, email } = req.body;

  if (!name || !username || !contact || !email) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    //  Fetch existing user profile first
    const rows = await new Promise((resolve, reject) =>
      db.query("SELECT userimage FROM users WHERE id = ?", [userId], (err, results) =>
        err ? reject(err) : resolve(results)
      )
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    let existingImage = rows[0].userimage;
    let finalImagePath = existingImage;

    //  Upload new file to S3 if provided
    if (req.file) {
      finalImagePath = await uploadToS3(req.file);
    }

    // 3️ Update DB
    const updateSql = `
      UPDATE users 
      SET name = ?, username = ?, contact = ?, email = ?, userimage = ?, updated_at = ? 
      WHERE id = ?
    `;
    const updateValues = [name, username, contact, email, finalImagePath, currentdate, userId];

    await new Promise((resolve, reject) =>
      db.query(updateSql, updateValues, (err) => (err ? reject(err) : resolve()))
    );

    res.status(200).json({ message: "Profile updated successfully" });
  } catch (err) {
    console.error("Error updating profile:", err);
    res.status(500).json({ message: "Server error", error: err });
  }
};

export const changePassword = async (req, res) => {
  const userId = req.adminUser?.id;
  const { currentPassword, newPassword } = req.body;

  if (!userId) {
    return res.status(400).json({ message: "Invalid User ID" });
  }

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: "Both current and new passwords are required" });
  }
  if(currentPassword === newPassword) {
    return res.status(400).json({ message: "New Password Cannot be Same as Current Password"});
  }
  
  try {
    // Fetch user's current password from the database
    db.query("SELECT password FROM users WHERE id = ?", [userId], async (err, result) => {
      if (err) {
        console.error("Error fetching user:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      if (result.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const storedPassword = result[0].password;

      // Compare provided current password with stored password
      const isMatch = await bcrypt.compare(currentPassword, storedPassword);
      if (!isMatch) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }

      // Hash the new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update the password in the database
      db.query("UPDATE users SET password = ? WHERE id = ?", [hashedPassword, userId], (updateErr) => {
        if (updateErr) {
          console.error("Error updating password:", updateErr);
          return res.status(500).json({ message: "Database error during update", error: updateErr });
        }

        res.status(200).json({ message: "Password changed successfully" });
      });
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Internal server error", error });
  }
};