import db from "../../config/dbconnect.js";
import moment from "moment-timezone";
import bcrypt from "bcryptjs";
import { uploadToS3 } from "../../utils/imageUpload.js";
import { convertSingleImageToWebp } from "../../utils/convertSingleImageToWebp.js";

function toSlug(text) {
  return text
    .toLowerCase() // Convert to lowercase
    .trim() // Remove leading/trailing spaces
    .replace(/[^a-z0-9\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-"); // Replace multiple hyphens with single
}

// **Fetch All **
export const getAll = (req, res) => {
  const sql = "SELECT * FROM news ORDER BY created_at DESC";
  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    const formatted = result.map((row) => ({
      ...row,
      created_at: moment.utc(row.created_at).tz("Asia/Kolkata").format("DD MMM YYYY | hh:mm A"),
      updated_at: moment.utc(row.updated_at).tz("Asia/Kolkata").format("DD MMM YYYY | hh:mm A"),
    }));

    res.json(formatted);
  });
};

// **Fetch All**
export const getAllActive = (req, res) => {
  const sql = "SELECT * FROM news WHERE status = 'Active' ORDER BY id DESC";
  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res.json(result);
  });
};

// **Fetch Single by ID**
export const getById = (req, res) => {
  const Id = parseInt(req.params.id);
  const sql = "SELECT * FROM news WHERE id = ?";

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "news not found" });
    }
    res.json(result[0]);
  });
};

// **Add New News**
export const add = async (req, res) => {
  try {
    const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
    const { type, title, description, content, state, city } = req.body;

    /* ---------- VALIDATION ---------- */
    if (!type || !title || !description || !content || !state || !city) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const cleanTitle = title.trim();
    const cleanDescription = description.trim();
    const cleanContent = content.trim();

    if (!cleanTitle || !cleanDescription || !cleanContent) {
      return res.status(400).json({ message: "Invalid input values" });
    }

    /* ---------- SEO SLUG ---------- */
    let seoSlug = toSlug(cleanTitle);

    const [existing] = await db
      .promise()
      .query(`SELECT id FROM news WHERE seoSlug = ?`, [seoSlug]);

    if (existing.length > 0) {
      seoSlug = `${seoSlug}-${Date.now()}`;
    }

    /* ---------- IMAGE UPLOAD (COMPRESS → S3) ---------- */
    let newsImageUrl = null;

    if (req.files?.newsImage?.[0]) {
      const compressedImage = await convertSingleImageToWebp(
        req.files.newsImage[0]
      );

      if (compressedImage) {
        newsImageUrl = await uploadToS3(compressedImage);
      }
    }

    /* ---------- INSERT NEWS ---------- */
    const sql = `
      INSERT INTO news (
        type,
        title,
        description,
        content,
        seoSlug,
        image,
        state,
        city,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await db
      .promise()
      .query(sql, [
        type,
        cleanTitle,
        cleanDescription,
        cleanContent,
        seoSlug,
        newsImageUrl,
        state,
        city,
        currentdate,
        currentdate,
      ]);

    return res.status(201).json({
      message: "News added successfully",
      newsId: result.insertId,
    });
  } catch (error) {
    console.error("Error inserting news:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/// **Edit News**
export const edit = async (req, res) => {
  try {
    const newsId = req.params.id;
    if (!newsId) {
      return res.status(400).json({ message: "Invalid News ID" });
    }

    const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
    const { type, title, description, content, state, city } = req.body;

    /* ---------- VALIDATION ---------- */
    if (!type || !title || !description || !content || !state || !city) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const cleanTitle = title.trim();
    const cleanDescription = description.trim();
    const cleanContent = content.trim();

    if (!cleanTitle || !cleanDescription || !cleanContent) {
      return res.status(400).json({ message: "Invalid input values" });
    }

    /* ---------- SEO SLUG ---------- */
    let seoSlug = toSlug(cleanTitle);

    const [existing] = await db
      .promise()
      .query(`SELECT id FROM news WHERE seoSlug = ? AND id != ?`, [
        seoSlug,
        newsId,
      ]);

    if (existing.length > 0) {
      seoSlug = `${seoSlug}-${Date.now()}`;
    }

    /* ---------- IMAGE UPLOAD (COMPRESS → S3) ---------- */
    let newsImageUrl = null;

    if (req.files?.newsImage?.[0]) {
      const compressedImage = await convertSingleImageToWebp(
        req.files.newsImage[0]
      );

      if (compressedImage) {
        newsImageUrl = await uploadToS3(compressedImage);
      }
    }

    /* ---------- UPDATE QUERY ---------- */
    let updateSql = `
      UPDATE news
      SET
        type = ?,
        title = ?,
        description = ?,
        content = ?,
        seoSlug = ?,
        state = ?,
        city = ?,
        updated_at = ?
    `;

    const updateValues = [
      type,
      cleanTitle,
      cleanDescription,
      cleanContent,
      seoSlug,
      state,
      city,
      currentdate,
    ];

    if (newsImageUrl) {
      updateSql += `, image = ?`;
      updateValues.push(newsImageUrl);
    }

    updateSql += ` WHERE id = ?`;
    updateValues.push(newsId);

    const [result] = await db.promise().query(updateSql, updateValues);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "News not found" });
    }

    return res.status(200).json({
      message: "News updated successfully",
      image: newsImageUrl || undefined,
    });
  } catch (error) {
    console.error("Error updating news:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

//**Change status */
export const status = (req, res) => {
  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid News ID" });
  }

  db.query("SELECT * FROM news WHERE id = ?", [Id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    let status = "";
    if (result[0].status === "Active") {
      status = "Inactive";
    } else {
      status = "Active";
    }
    console.log(status);
    db.query(
      "UPDATE news SET status = ? WHERE id = ?",
      [status, Id],
      (err, result) => {
        if (err) {
          console.error("Error deleting :", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }
        res.status(200).json({ message: "News status change successfully" });
      }
    );
  });
};

//* ADD Seo Details */
export const seoDetails = (req, res) => {
  const { seoSlug, seoTitle, seoDescription } = req.body;
  if (!seoSlug || !seoTitle || !seoDescription) {
    return res.status(401).json({ message: "All Field Are Required" });
  }
  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid ID" });
  }

  db.query("SELECT * FROM news WHERE id = ?", [Id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    db.query(
      "UPDATE news SET seoSlug = ?, seoTitle = ?, seoDescription = ? WHERE id = ?",
      [seoSlug, seoTitle, seoDescription, Id],
      (err, result) => {
        if (err) {
          console.error("Error While Add Seo Details:", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }
        res.status(200).json({ message: "Seo Details Add successfully" });
      }
    );
  });
};

// **Delete **
export const del = (req, res) => {
  const Id = parseInt(req.params.id);

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid News ID" });
  }

  db.query("SELECT * FROM news WHERE id = ?", [Id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "News not found" });
    }

    db.query("DELETE FROM news WHERE id = ?", [Id], (err) => {
      if (err) {
        console.error("Error deleting :", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      res.status(200).json({ message: "News deleted successfully" });
    });
  });
};
