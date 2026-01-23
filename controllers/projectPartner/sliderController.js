import db from "../../config/dbconnect.js";
import moment from "moment";
import fs from "fs";
import path from "path";
import { deleteFromS3, uploadToS3 } from "../../utils/imageUpload.js";

// **Fetch All **
export const getAll = (req, res) => {
  const userId = req.projectPartnerUser.id;
  if (!userId) {
    return res
      .status(401)
      .json({ message: "Unauthorized Access, Please Login Again!" });
  }
  const sql = "SELECT * FROM sliders WHERE projectpartnerid = ? ORDER BY id";
  db.query(sql, [userId], (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res.json(result);
  });
};

// ---------------- ADD MULTIPLE SLIDER IMAGES ----------------
export const addImages = async (req, res) => {
  const userId = req.projectPartnerUser.id;
  if (!userId)
    return res
      .status(401)
      .json({ message: "Unauthorized Access, Please Login Again!" });

  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");

  try {
    const files = req.files || [];
    if (!files.length)
      return res.status(400).json({ message: "No images uploaded" });

    // Upload all images to S3 in parallel
    const imageUrls = await Promise.all(files.map((file) => uploadToS3(file)));

    // Prepare insert values
    const values = imageUrls.map((url) => [
      userId,
      url,
      currentdate,
      currentdate,
    ]);

    const insertSQL = `INSERT INTO sliders (projectpartnerid, image, updated_at, created_at) VALUES ?`;

    db.query(insertSQL, [values], (err, result) => {
      if (err) {
        console.error("Error inserting Images:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      res
        .status(200)
        .json({ message: "Images uploaded successfully", images: imageUrls });
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ message: "Upload failed", error: err });
  }
};

// ---------------- ADD/UPDATE MOBILE SLIDER IMAGE ----------------
export const addSmallScreenImage = async (req, res) => {
  const userId = req.projectPartnerUser.id;
  if (!userId)
    return res
      .status(401)
      .json({ message: "Unauthorized Access, Please Login Again!" });

  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const Id = parseInt(req.params.id);
  if (!Id) return res.status(400).json({ message: "Invalid Slider Image Id" });

  try {
    const file = req.file;
    if (!file) return res.status(400).json({ message: "No image uploaded" });

    // Upload new image to S3
    const newImageUrl = await uploadToS3(file);

    // Fetch old image to delete from S3 if exists
    db.query(
      "SELECT mobileimage FROM sliders WHERE id = ?",
      [Id],
      async (err, results) => {
        if (err) {
          console.error("Error fetching old image:", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }

        const oldImageUrl = results[0]?.mobileimage;
        if (oldImageUrl) await deleteFromS3(oldImageUrl);

        // Update DB with new image URL
        const updateSQL = `UPDATE sliders SET mobileimage = ?, updated_at = ? WHERE id = ?`;
        db.query(
          updateSQL,
          [newImageUrl, currentdate, Id],
          (updateErr, result) => {
            if (updateErr) {
              console.error("Error updating image:", updateErr);
              return res
                .status(500)
                .json({ message: "Database error", error: updateErr });
            }

            res.status(200).json({
              message: "Image uploaded successfully",
              image: newImageUrl,
            });
          },
        );
      },
    );
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ message: "Upload failed", error: err });
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
      },
    );
  });
};

export const del = (req, res) => {
  const Id = parseInt(req.params.id);
  if (isNaN(Id))
    return res.status(400).json({ message: "Invalid Slider Image ID" });

  db.query("SELECT image FROM sliders WHERE id = ?", [Id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Slider Image not found" });
    }

    const imagePath = result[0].image; // Get the image path from the database
    if (imagePath) {
      const filePath = path.join(process.cwd(), imagePath); // Full path to the file

      // Delete the image file from the uploads folder
      fs.unlink(filePath, (err) => {
        if (err && err.code !== "ENOENT") {
          console.error("Error deleting image:", err);
        }
      });
    }

    // Now delete the property from the database
    db.query("DELETE FROM sliders WHERE id = ?", [Id], (err) => {
      if (err) {
        console.error("Error deleting slider image:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      res.status(200).json({ message: "Slider image deleted successfully" });
    });
  });
};
