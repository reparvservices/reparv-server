import db from "../../config/dbconnect.js";
import moment from "moment";
import bcrypt from "bcryptjs";
import sendEmail from "../../utils/nodeMailer.js";

const saltRounds = 10;

export const getProfile = (req, res) => {
  const Id = req.guestUser?.id;
  if (!Id) {
    return res.status(400).json({ message: "Unauthorized User" });
  }

  const sql = `SELECT * FROM guestUsers WHERE id = ?`;

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

export const editProfile = (req, res) => {
  const userId = req.guestUser?.id;
  if (!userId) {
    return res.status(400).json({ message: "Invalid User ID" });
  }

  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const { fullname, contact, email, address, state, city } = req.body;

  if (!fullname || !email || !address || !state || !city) {
    return res.status(400).json({ message: "All fields are required" });
  }

  // Fetch existing user profile first
  db.query(
    "SELECT userimage FROM guestUsers WHERE id = ?",
    [userId],
    (err, result) => {
      if (err) {
        console.error("Error fetching user:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      if (result.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }

      const existingImage = result[0].userimage;
      const finalImagePath = req.file
        ? `/uploads/${req.file.filename}`
        : existingImage;

      let updateSql = `UPDATE guestUsers SET fullname = ?, email = ?, address = ?, state = ?, city = ?, userimage = ?, updated_at = ? WHERE id = ?`;
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

      db.query(updateSql, updateValues, (updateErr, updateResult) => {
        if (updateErr) {
          console.error("Error updating profile:", updateErr);
          return res
            .status(500)
            .json({
              message: "Database error during update",
              error: updateErr,
            });
        }

        res.status(200).json({ message: "Profile updated successfully" });
      });
    }
  );
};

export const changeContact = async (req, res) => {
  const userId = req.guestUser?.id;
  const { contact } = req.body;

  if (!userId) {
    return res.status(400).json({ message: "Invalid User ID" });
  }

  if (!contact) {
    return res
      .status(400)
      .json({ message: "contact is required" });
  }

  try {
    // Fetch user's current password from the database
    db.query(
      "SELECT contact FROM guestUsers WHERE id = ?",
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

        const storedContact = result[0].contact;

        // Update the contact in the database
        db.query(
          "UPDATE guestUsers SET contact = ? WHERE id = ?",
          [contact, userId],
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

            res.status(200).json({ message: "Contact changed successfully" });
          }
        );
      }
    );
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Internal server error", error });
  }
};
