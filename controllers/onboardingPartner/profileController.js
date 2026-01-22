import db from "../../config/dbconnect.js";
import moment from "moment";
import bcrypt from "bcryptjs";
import sendEmail from "../../utils/nodeMailer.js";
import { uploadToS3 } from "../../utils/imageUpload.js";

const saltRounds = 10;

export const getProfile = (req, res) => {
  const Id = req.onboardingUser?.id;
  if (!Id) {
    return res.status(400).json({ message: "Unauthorized User" });
  }

  const sql = `SELECT * FROM onboardingpartner WHERE partnerid = ?`;

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
  const userId = req.onboardingUser?.id;
  if (!userId) {
    return res.status(400).json({ message: "Invalid User ID" });
  }

  const { fullname, username, contact, email } = req.body;

  if (!fullname || !username || !contact || !email) {
    return res.status(400).json({ message: "All fields are required" });
  }

  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");

  try {
    // 1. Get existing image
    db.query(
      "SELECT userimage FROM onboardingpartner WHERE partnerid = ?",
      [userId],
      async (err, result) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ message: "Database error" });
        }

        if (result.length === 0) {
          return res.status(404).json({ message: "User not found" });
        }

        let finalImage = result[0].userimage;

        // 2. Upload new image to S3 if provided
        if (req.file) {
          finalImage = await uploadToS3(req.file, "profile-images");
        }

        // 3. Update profile
        const updateSql = `
          UPDATE onboardingpartner 
          SET fullname = ?, username = ?, contact = ?, email = ?, userimage = ?, updated_at = ?
          WHERE partnerid = ?
        `;

        const values = [
          fullname,
          username,
          contact,
          email,
          finalImage,
          currentdate,
          userId,
        ];

        db.query(updateSql, values, (updateErr) => {
          if (updateErr) {
            console.error(updateErr);
            return res.status(500).json({ message: "Update failed" });
          }

          res.status(200).json({
            message: "Profile updated successfully",
            userimage: finalImage,
          });
        });
      },
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "S3 upload failed", error });
  }
};

export const changePassword = async (req, res) => {
  const userId = req.onboardingUser?.id;
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
      "SELECT password FROM onboardingpartner WHERE partnerid = ?",
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
          "UPDATE onboardingpartner SET password = ? WHERE partnerid = ?",
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
          },
        );
      },
    );
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Internal server error", error });
  }
};
