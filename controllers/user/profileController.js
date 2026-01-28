import db from "../../config/dbconnect.js";
import moment from "moment";
import { uploadToS3 } from "../../utils/imageUpload.js";

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
  if (!userId) return res.status(400).json({ message: "Invalid User ID" });

  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const { fullname, contact, email, address, state, city } = req.body;

  if (!fullname || !email || !address || !state || !city) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    // Fetch existing user profile first
    const existingResult = await new Promise((resolve, reject) => {
      db.query(
        "SELECT userimage FROM guestUsers WHERE id = ?",
        [userId],
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
    });

    if (existingResult.length === 0)
      return res.status(404).json({ message: "User not found" });

    let finalImagePath = existingResult[0].userimage;

    // If new image uploaded, push to S3
    if (req.file) {
      const s3Result = await uploadToS3(req.file.buffer, req.file.originalname);
      finalImagePath = s3Result; // URL returned from S3
    }

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
      db.query(updateSql, updateValues, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    res.status(200).json({
      message: "Profile updated successfully",
      userImage: finalImagePath,
    });
  } catch (err) {
    console.error("Error updating profile:", err);
    res.status(500).json({ message: "Internal server error", error: err });
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
