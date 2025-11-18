import db from "../../config/dbconnect.js";
import moment from "moment";
import fs from "fs";
import path from "path";

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

// **Add Slider Images **
export const addImages = (req, res) => {
  const userId = req.projectPartnerUser.id;
  if (!userId) {
    return res
      .status(401)
      .json({ message: "Unauthorized Access, Please Login Again!" });
  }
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");

  try {
    const files = req.files; // Array of uploaded files
    const imagePaths = files.map((file) => file.filename); // Get filenames

    // Insert each image as a separate row
    const insertSQL = `INSERT INTO sliders (projectpartnerid, image, updated_at, created_at) 
                         VALUES ?`;

    const values = imagePaths.map((filename) => [
      userId,
      filename,
      currentdate,
      currentdate,
    ]);

    db.query(insertSQL, [values], (err, result) => {
      if (err) {
        console.error("Error inserting Images:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      res
        .status(200)
        .json({ message: "Images uploaded SuccessFully", images: imagePaths });
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Upload failed" });
  }
};

// **Add Slider Image **
export const addSmallScreenImage = (req, res) => {
  const userId = req.projectPartnerUser.id;
  if (!userId) {
    return res
      .status(401)
      .json({ message: "Unauthorized Access, Please Login Again!" });
  }
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const Id = parseInt(req.params.id);

  if (!Id) {
    return res.status(400).json({ message: "Invalid Slider Image Id" });
  }

  try {
    const imagePath = req.file ? req.file.filename : null;

    if (!imagePath) {
      return res.status(400).json({ message: "No image uploaded" });
    }

    const updateSQL = `UPDATE sliders SET mobileimage = ?, updated_at = ? WHERE id = ?`;

    db.query(updateSQL, [imagePath, currentdate, Id], (err, result) => {
      if (err) {
        console.error("Error updating image:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      res.status(200).json({
        message: "Image uploaded successfully",
        image: imagePath,
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
