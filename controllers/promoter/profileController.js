import db from "../../config/dbconnect.js";
import moment from "moment";
import bcrypt from "bcryptjs";

export const getProfile = (req, res) => {
  const Id = req.promoterUser?.id;
  if (!Id) {
    return res.status(400).json({ message: "Unauthorized User" });
  }

  const sql = `SELECT * FROM promoter WHERE id = ?`;

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
  const userId = req.promoterUser?.id;
  if (!userId) {
    return res.status(400).json({ message: "Invalid User ID" });
  }

  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const { fullname, username, contact, email } = req.body;

  if (!fullname || !username || !contact || !email) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    // 1️⃣ Fetch existing user profile
    const result = await new Promise((resolve, reject) => {
      db.query(
        "SELECT userimage FROM promoter WHERE id = ?",
        [userId],
        (err, res) => (err ? reject(err) : resolve(res)),
      );
    });

    if (result.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const existingImage = result[0].userimage;
    let finalImagePath = existingImage;

    // 2️⃣ Upload new image to S3 if provided
    if (req.file) {
      finalImagePath = await uploadToS3(req.file);

      // Delete old image from S3 if exists
      if (existingImage) {
        await deleteFromS3(existingImage);
      }
    }

    // 3️⃣ Update user profile in DB
    const updateSql = `
      UPDATE promoter
      SET fullname = ?, username = ?, contact = ?, email = ?, userimage = ?, updated_at = ?
      WHERE id = ?
    `;
    const updateValues = [
      fullname,
      username,
      contact,
      email,
      finalImagePath,
      currentdate,
      userId,
    ];

    await new Promise((resolve, reject) => {
      db.query(updateSql, updateValues, (err, res) =>
        err ? reject(err) : resolve(res),
      );
    });

    return res.status(200).json({
      message: "Profile updated successfully",
      userimage: finalImagePath, // return S3 URL
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    return res.status(500).json({ message: "Server error", error });
  }
};

export const changePassword = async (req, res) => {
  const userId = req.promoterUser?.id;
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
      "SELECT password FROM promoter WHERE id = ?",
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
          "UPDATE promoter SET password = ? WHERE id = ?",
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
          },
        );
      },
    );
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Internal server error", error });
  }
};
