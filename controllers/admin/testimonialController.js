import db from "../../config/dbconnect.js";
import moment from "moment";
import { uploadToS3 } from "../../utils/imageUpload.js";

// **Fetch All **
export const getAll = (req, res) => {
  const sql = "SELECT * FROM testimonials ORDER BY id";
  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res.json(result);
  });
};

// **Fetch Single by ID**
export const getById = (req, res) => {
  const id = parseInt(req.params.id);
  const sql = "SELECT * FROM testimonials WHERE id = ?";

  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Testimonial not found" });
    }
    res.json(result[0]);
  });
};

// **Add New Builder**
export const add = async (req, res) => {
  try {
    const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
    const { url, message, client } = req.body;

    if (!url || !client) {
      return res.status(400).json({
        message: "Client and Video URL are required",
      });
    }

    /* ---------- UPLOAD IMAGE TO S3 ---------- */
    let clientImageUrl = null;

    if (req.file) {
      clientImageUrl = await uploadToS3(req.file); // returns full S3 URL
    }

    /* ---------- INSERT INTO DB ---------- */
    const insertSQL = `
      INSERT INTO testimonials
      (url, message, client, clientimage, updated_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.query(
      insertSQL,
      [url, message, client, clientImageUrl, currentdate, currentdate],
      (err, result) => {
        if (err) {
          console.error("Error inserting testimonial:", err);
          return res.status(500).json({
            message: "Database error",
            error: err,
          });
        }

        return res.status(201).json({
          message: "Testimonial added successfully",
          id: result.insertId,
        });
      },
    );
  } catch (error) {
    console.error("Testimonial upload error:", error);
    return res.status(500).json({
      message: "Upload failed",
      error,
    });
  }
};

export const update = async (req, res) => {
  try {
    const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
    const Id = req.params.id ? parseInt(req.params.id) : null;

    const { url, message, client } = req.body;

    if (!url || !client) {
      return res
        .status(400)
        .json({ message: "Client Name and Video URL are required!" });
    }

    // Fetch existing testimonial
    db.query("SELECT * FROM testimonials WHERE id = ?", [Id], async (err, result) => {
      if (err)
        return res.status(500).json({ message: "Database error", error: err });

      if (result.length === 0)
        return res.status(404).json({ message: "Testimonial not found" });

      const oldData = result[0];
      let finalImageUrl = oldData.clientimage; // default to old image

      // If new image uploaded, upload to S3 & delete old S3 image
      if (req.file) {
        try {
          // Delete old image from S3
          if (oldData.clientimage) {
            await deleteFromS3(oldData.clientimage);
          }

          // Upload new image to S3
          finalImageUrl = await uploadToS3(req.file);
        } catch (s3Err) {
          console.error("S3 upload/delete error:", s3Err);
          return res.status(500).json({ message: "S3 upload failed", error: s3Err });
        }
      }

      // Update testimonial in DB
      const sql = `
        UPDATE testimonials
        SET url = ?, message = ?, client = ?, clientimage = ?, updated_at = ?
        WHERE id = ?
      `;

      db.query(sql, [url, message, client, finalImageUrl, currentdate, Id], (updateErr) => {
        if (updateErr) {
          console.error("Error updating testimonial:", updateErr);
          return res.status(500).json({ message: "Database error", error: updateErr });
        }

        res.status(200).json({ message: "Testimonial updated successfully" });
      });
    });
  } catch (error) {
    console.error("Update testimonial error:", error);
    return res.status(500).json({ message: "Server error", error });
  }
};


// **Delete**
export const del = (req, res) => {
  const Id = req.params.id ? parseInt(req.params.id) : null;

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Testimonial ID" });
  }

  db.query("SELECT * FROM testimonials WHERE id = ?", [Id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Testimonial not found" });
    }

    db.query("DELETE FROM testimonials WHERE id = ?", [Id], (err) => {
      if (err) {
        console.error("Error deleting:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      res.status(200).json({ message: "Testimonial deleted successfully" });
    });
  });
};

// **Change Status**
export const status = (req, res) => {
  const Id = parseInt(req.params.id);

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Testimonial ID" });
  }

  db.query("SELECT * FROM testimonials WHERE id = ?", [Id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (result.length === 0) {
      return res.status(404).json({ message: "Testimonial not found" });
    }

    const newStatus = result[0].status === "Active" ? "Inactive" : "Active";

    db.query(
      "UPDATE testimonials SET status = ? WHERE id = ?",
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
          .json({ message: `Testimonial status changed to ${newStatus}` });
      },
    );
  });
};
