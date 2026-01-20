import db from "../../config/dbconnect.js";
import moment from "moment";
import fs from "fs";
import path from "path";
import { deleteFromS3, uploadToS3 } from "../../utils/imageUpload.js";

// **Fetch All **
export const getAll = (req, res) => {
  const sql = "SELECT * FROM sliders WHERE projectpartnerid IS NULL ORDER BY id";
  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res.json(result);
  });
};

// **Add Slider Images **
export const addImages = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");

  try {
    const files = req.files; // array of files from multer

    if (!files || files.length === 0) {
      return res.status(400).json({ message: "No images uploaded" });
    }

    // 1️⃣ Upload all images to S3
    const imageUrls = [];

    for (const file of files) {
      const url = await uploadToS3(file, "sliders"); // S3 folder: sliders
      imageUrls.push(url);
    }

    // 2️⃣ Prepare bulk insert
    const insertSQL = `
      INSERT INTO sliders (image, updated_at, created_at)
      VALUES ?
    `;

    const values = imageUrls.map((url) => [
      url,
      currentdate,
      currentdate,
    ]);

    // 3️⃣ Insert into DB
    db.query(insertSQL, [values], (err) => {
      if (err) {
        console.error("Error inserting images:", err);
        return res.status(500).json({
          message: "Database error",
          error: err,
        });
      }

      res.status(200).json({
        message: "Images uploaded successfully",
        images: imageUrls,
      });
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ message: "Upload failed", error: err });
  }
};


// **Add Slider Image **
export const addSmallScreenImage = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const Id = parseInt(req.params.id);

  if (!Id) {
    return res.status(400).json({ message: "Invalid Slider Image Id" });
  }

  try {
    if (!req.file) {
      return res.status(400).json({ message: "No image uploaded" });
    }

    // Upload to S3
    const imageUrl = await uploadToS3(req.file, "sliders/mobile");

    const updateSQL = `
      UPDATE sliders 
      SET mobileimage = ?, updated_at = ? 
      WHERE id = ?
    `;

    db.query(updateSQL, [imageUrl, currentdate, Id], (err) => {
      if (err) {
        console.error("Error updating image:", err);
        return res.status(500).json({
          message: "Database error",
          error: err,
        });
      }

      res.status(200).json({
        message: "Image uploaded successfully",
        image: imageUrl,
      });
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Upload failed" });
  }
};


// **Change Status**
export const status = (req, res) => {
  const Id = parseInt(req.params.id);

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Slider Image ID" });
  }

  db.query("SELECT * FROM sliders WHERE id = ?", [Id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (result.length === 0) {
      return res.status(404).json({ message: "Slider Image not found" });
    }

    const newStatus = result[0].status === "Active" ? "Inactive" : "Active";

    db.query(
      "UPDATE sliders SET status = ? WHERE id = ?",
      [newStatus, Id],
      (err) => {
        if (err) {
          console.error("Error updating status:", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }
        res
          .status(200)
          .json({ message: `Slider Image status changed to ${newStatus}` });
      }
    );
  });
};

// **Delete Slider Image **
export const del = (req, res) => {
  const Id = parseInt(req.params.id);

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Slider Image ID" });
  }

  db.query("SELECT image FROM sliders WHERE id = ?", [Id], async (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (result.length === 0) {
      return res.status(404).json({ message: "Slider Image not found" });
    }

    const imageUrl = result[0].image;

    /* ---------- DELETE IMAGE FROM S3 ---------- */
    try {
      if (imageUrl) {
        await deleteFromS3(imageUrl);
      }
    } catch (s3Err) {
      console.error("S3 delete error:", s3Err);
      // Continue DB delete even if S3 delete fails
    }

    /* ---------- DELETE RECORD FROM DB ---------- */
    db.query("DELETE FROM sliders WHERE id = ?", [Id], (err) => {
      if (err) {
        console.error("Error deleting slider image:", err);
        return res.status(500).json({
          message: "Database error",
          error: err,
        });
      }

      res.status(200).json({
        message: "Slider image deleted successfully",
      });
    });
  });
};
