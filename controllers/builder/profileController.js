import db from "../../config/dbconnect.js";
import moment from "moment";
import bcrypt from "bcryptjs";
import sendEmail from "../../utils/nodeMailer.js";
import { deleteFromS3, uploadToS3 } from "../../utils/imageUpload.js";

const saltRounds = 10;

export const getProfile = (req, res) => {
  const Id = req.builderUser?.id;
  if (!Id) {
    return res.status(400).json({ message: "Unauthorized User" });
  }

  const sql = `SELECT * FROM builders WHERE builderid = ?`;
  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching profile:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(result[0]);
  });
};

export const editProfile = async (req, res) => {
  const userId = req.builderUser?.id;
  if (!userId) {
    return res.status(400).json({ message: "Invalid User ID" });
  }

  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const { contact_person, username, contact, email } = req.body;

  if (!contact_person || !username || !contact || !email) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    // STEP 1: Fetch existing user profile
    db.query(
      "SELECT userimage FROM builders WHERE builderid = ?",
      [userId],
      async (err, result) => {
        if (err) {
          console.error("Error fetching user:", err);
          return res.status(500).json({ message: "Database error", error: err });
        }

        if (result.length === 0) {
          return res.status(404).json({ message: "User not found" });
        }

        const existingImageUrl = result[0].userimage;
        let newImageUrl = existingImageUrl;

        // STEP 2: Upload new image to S3 if provided
        if (req.file) {
          try {
            newImageUrl = await uploadToS3(req.file);

            // Delete old image from S3 if exists
            if (existingImageUrl) {
              await deleteFromS3(existingImageUrl);
            }
          } catch (s3Err) {
            console.error("S3 upload/delete error:", s3Err);
            return res.status(500).json({ message: "S3 upload/delete failed", error: s3Err });
          }
        }

        // STEP 3: Update builder profile in DB
        const updateSql = `
          UPDATE builders 
          SET contact_person = ?, username = ?, contact = ?, email = ?, userimage = ?, updated_at = ? 
          WHERE builderid = ?
        `;
        const updateValues = [
          contact_person,
          username,
          contact,
          email,
          newImageUrl,
          currentdate,
          userId,
        ];

        db.query(updateSql, updateValues, (updateErr, updateResult) => {
          if (updateErr) {
            console.error("Error updating profile:", updateErr);
            return res.status(500).json({
              message: "Database error during update",
              error: updateErr,
            });
          }

          res.status(200).json({ message: "Profile updated successfully", userimage: newImageUrl });
        });
      }
    );
  } catch (error) {
    console.error("Edit profile error:", error);
    return res.status(500).json({ message: "Server error", error });
  }
};


export const changePassword = async (req, res) => {
  const userId = req.builderUser?.id;
  const { currentPassword, newPassword } = req.body;

  if (!userId) {
    return res.status(400).json({ message: "Invalid User ID" });
  }

  if (!currentPassword || !newPassword) {
    return res
      .status(400)
      .json({ message: "Both current and new passwords are required" });
  }
  if (currentPassword === newPassword) {
    return res
      .status(400)
      .json({ message: "New Password Cannot be Same as Current Password" });
  }

  try {
    // Fetch user's current password from the database
    db.query(
      "SELECT password FROM builders WHERE builderid = ?",
      [userId],
      async (err, result) => {
        if (err) {
          console.error("Error fetching user:", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }

        if (result.length === 0) {
          return res.status(404).json({ message: "User not found" });
        }

        const storedPassword = result[0].password;

        // Compare provided current password with stored password
        const isMatch = await bcrypt.compare(currentPassword, storedPassword);
        if (!isMatch) {
          return res
            .status(400)
            .json({ message: "Current password is incorrect" });
        }

        // Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update the password in the database
        db.query(
          "UPDATE builders SET password = ? WHERE builderid = ?",
          [hashedPassword, userId],
          (updateErr) => {
            if (updateErr) {
              console.error("Error updating password:", updateErr);
              return res
                .status(500)
                .json({
                  message: "Database error during update",
                  error: updateErr,
                });
            }

            res.status(200).json({ message: "Password changed successfully" });
          }
        );
      }
    );
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Internal server error", error });
  }
};
