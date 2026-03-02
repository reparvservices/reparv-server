import db from "../../config/dbconnect.js";
import moment from "moment-timezone";
import bcrypt from "bcryptjs";
import sendEmail from "../../utils/nodeMailer.js";
import { deleteFromS3, uploadToS3 } from "../../utils/imageUpload.js";
import { convertSingleImageToWebp } from "../../utils/convertSingleImageToWebp.js";

const saltRounds = 10;

export const getProfile = (req, res) => {
  const Id = req.employeeUser?.id;

  if (!Id) {
    return res.status(400).json({ message: "Unauthorized User" });
  }

  const sql = `SELECT * FROM employees INNER JOIN roles ON roles.roleid = employees.roleid WHERE id = ?`;
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
  const userId = req.employeeUser?.id;

  if (!userId) {
    return res.status(400).json({ message: "Invalid User ID" });
  }

  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const { name, username, contact, email } = req.body;

  if (!name || !username || !contact || !email) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    /* ================================
       STEP 1: Fetch existing profile
    ================================= */
    db.query(
      "SELECT userimage FROM employees WHERE id = ?",
      [userId],
      async (err, result) => {
        if (err) {
          console.error("Error fetching user:", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }

        if (!result.length) {
          return res.status(404).json({ message: "User not found" });
        }

        const existingImage = result[0].userimage;
        let finalImageUrl = existingImage;

        /* ================================
           STEP 2: Compress + Upload Image
        ================================= */
        if (req.file) {
          try {
            // 🔹 Convert to WebP
            const convertedImage = await convertSingleImageToWebp(req.file);

            if (convertedImage) {
              finalImageUrl = await uploadToS3(convertedImage);
            }

            // Delete old image AFTER successful upload
            if (existingImage) {
              await deleteFromS3(existingImage);
            }
          } catch (imgErr) {
            console.error("Image upload/delete error:", imgErr);
            return res.status(500).json({
              message: "Profile image upload failed",
              error: imgErr,
            });
          }
        }

        /* ================================
           STEP 3: Update DB
        ================================= */
        const updateSql = `
          UPDATE employees
          SET name = ?, username = ?, contact = ?, email = ?, userimage = ?, updated_at = ?
          WHERE id = ?
        `;

        const updateValues = [
          name,
          username,
          contact,
          email,
          finalImageUrl,
          currentdate,
          userId,
        ];

        db.query(updateSql, updateValues, (updateErr) => {
          if (updateErr) {
            console.error("Error updating profile:", updateErr);
            return res.status(500).json({
              message: "Database error during update",
              error: updateErr,
            });
          }

          return res.status(200).json({
            message: "Profile updated successfully",
            userimage: finalImageUrl,
          });
        });
      }
    );
  } catch (error) {
    console.error("Edit profile error:", error);
    return res.status(500).json({ message: "Server error", error });
  }
};

export const changePassword = async (req, res) => {
  const userId = req.employeeUser?.id;
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
      "SELECT password FROM employees WHERE id = ?",
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
          "UPDATE employees SET password = ? WHERE id = ?",
          [hashedPassword, userId],
          (updateErr) => {
            if (updateErr) {
              console.error("Error updating password:", updateErr);
              return res.status(500).json({
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
