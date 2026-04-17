import db from "#db";
import moment from "moment-timezone";
import bcrypt from "bcryptjs";
import { uploadToS3 } from "#utils/imageUpload.js";
import { convertSingleImageToWebp } from "#utils/convertSingleImageToWebp.js";

function toSlug(text) {
  return text
    .toLowerCase() // Convert to lowercase
    .trim() // Remove leading/trailing spaces
    .replace(/[^a-z0-9\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-"); // Replace multiple hyphens with single
}

// **Fetch All Blogs**
export const getAll = (req, res) => {
  const sql = `
    SELECT 
      b.*,

      /* Likes */
      COALESCE(likesData.likes,0) AS likes,

      /* Views */
      COALESCE(ba.views,0) AS views,

      /* Shares */
      COALESCE(ba.shares,0) AS shares

    FROM blogs b

    LEFT JOIN (
      SELECT 
        blog_id,
        COUNT(DISTINCT guest_user_id) AS likes
      FROM user_blog_wishlist
      GROUP BY blog_id
    ) likesData
      ON likesData.blog_id = b.id

    LEFT JOIN blog_analyst ba
      ON ba.blog_id = b.id

    ORDER BY b.created_at DESC
  `;

  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching blogs:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    const formatted = result.map((row) => ({
      ...row,
      likes: Number(row.likes) || 0,
      views: Number(row.views) || 0,
      shares: Number(row.shares) || 0,
      created_at: moment
        .utc(row.created_at)
        .tz("Asia/Kolkata")
        .format("DD MMM YYYY | hh:mm A"),
      updated_at: moment
        .utc(row.updated_at)
        .tz("Asia/Kolkata")
        .format("DD MMM YYYY | hh:mm A"),
    }));

    res.json(formatted);
  });
};

// **Fetch Active Blogs**
export const getAllActive = (req, res) => {
  const sql = `
    SELECT 
      b.*,

      COALESCE(likesData.likes,0) AS likes,
      COALESCE(ba.views,0) AS views,
      COALESCE(ba.shares,0) AS shares

    FROM blogs b

    LEFT JOIN (
      SELECT 
        blog_id,
        COUNT(DISTINCT guest_user_id) AS likes
      FROM user_blog_wishlist
      GROUP BY blog_id
    ) likesData
      ON likesData.blog_id = b.id

    LEFT JOIN blog_analyst ba
      ON ba.blog_id = b.id

    WHERE b.status = 'Active'

    ORDER BY b.created_at DESC
  `;

  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching blogs:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    res.json(result);
  });
};

// **Fetch Single Blog by ID with Analytics**
export const getById = (req, res) => {
  const blogId = req.params.id;

  const sql = `
    SELECT 
      b.*,

      COALESCE(likesData.likes,0) AS likes,
      COALESCE(ba.views,0) AS views,
      COALESCE(ba.shares,0) AS shares

    FROM blogs b

    LEFT JOIN (
      SELECT 
        blog_id,
        COUNT(DISTINCT guest_user_id) AS likes
      FROM user_blog_wishlist
      GROUP BY blog_id
    ) likesData
      ON likesData.blog_id = b.id

    LEFT JOIN blog_analyst ba
      ON ba.blog_id = b.id

    WHERE b.id = ?
    LIMIT 1
  `;

  db.query(sql, [blogId], (err, result) => {
    if (err) {
      console.error("Error fetching blog:", err);
      return res.status(500).json({ message: "Database error" });
    }

    if (!result.length) {
      return res.status(404).json({ message: "Blog not found" });
    }

    const row = result[0];

    res.json({
      ...row,
      likes: Number(row.likes) || 0,
      views: Number(row.views) || 0,
      shares: Number(row.shares) || 0,
      created_at: moment
        .utc(row.created_at)
        .tz("Asia/Kolkata")
        .format("DD MMM YYYY | hh:mm A"),
      updated_at: moment
        .utc(row.updated_at)
        .tz("Asia/Kolkata")
        .format("DD MMM YYYY | hh:mm A"),
    });
  });
};

// **Add New Blog**
export const add = async (req, res) => {
  try {
    const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
    const { type, tittle, description, content } = req.body;

    /* Validation */
    if (!tittle || !description || !content) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const seoSlug = toSlug(tittle);

    /* Upload + Compress Blog Image */
    const uploadBlogImage = async () => {
      if (!req.files?.blogImage?.[0]) return null;

      // Convert image to WebP
      const compressedImage = await convertSingleImageToWebp(
        req.files.blogImage[0],
      );

      if (!compressedImage) return null;

      // Upload compressed image to S3
      return await uploadToS3(compressedImage);
    };

    const blogImageUrl = await uploadBlogImage();

    /* Insert Blog */
    const sql = `
      INSERT INTO blogs 
      (type, tittle, description, content, seoSlug, image, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await db
      .promise()
      .query(sql, [
        type,
        tittle,
        description,
        content,
        seoSlug,
        blogImageUrl,
        currentdate,
        currentdate,
      ]);

    return res.status(201).json({
      message: "Blog added successfully",
      blogId: result.insertId,
      image: blogImageUrl,
    });
  } catch (error) {
    console.error("Error inserting blog:", error);
    return res.status(500).json({
      message: "Server error",
    });
  }
};

// **Edit Blog**
export const edit = async (req, res) => {
  try {
    const blogId = req.params.id;
    if (!blogId) {
      return res.status(400).json({ message: "Invalid Blog ID" });
    }

    const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
    const { type, tittle, description, content } = req.body;

    /* Validation */
    if (!tittle || !description || !content) {
      return res.status(400).json({ message: "All fields are required" });
    }

    /* Upload + Compress new image (if provided) */
    let blogImageUrl = null;

    if (req.files?.blogImage?.[0]) {
      // Convert to WebP
      const compressedImage = await convertSingleImageToWebp(
        req.files.blogImage[0],
      );

      if (compressedImage) {
        blogImageUrl = await uploadToS3(compressedImage);
      }
    }

    /* Build update query dynamically */
    let updateSql = `
      UPDATE blogs 
      SET 
        type = ?, 
        tittle = ?, 
        description = ?, 
        content = ?, 
        updated_at = ?
    `;
    const updateValues = [type, tittle, description, content, currentdate];

    if (blogImageUrl) {
      updateSql += `, image = ?`;
      updateValues.push(blogImageUrl);
    }

    updateSql += ` WHERE id = ?`;
    updateValues.push(blogId);

    const [result] = await db.promise().query(updateSql, updateValues);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Blog not found" });
    }

    return res.status(200).json({
      message: "Blog updated successfully",
      image: blogImageUrl || undefined,
    });
  } catch (error) {
    console.error("Error updating blog:", error);
    return res.status(500).json({
      message: "Server error",
    });
  }
};

//**Change status */
export const status = (req, res) => {
  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Blog ID" });
  }

  db.query("SELECT * FROM blogs WHERE id = ?", [Id], (err, result) => {
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
      "UPDATE blogs SET status = ? WHERE id = ?",
      [status, Id],
      (err, result) => {
        if (err) {
          console.error("Error deleting :", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }
        res.status(200).json({ message: "Blog status change successfully" });
      },
    );
  });
};

//* ADD Seo Details */
export const seoDetails = (req, res) => {
  const { seoSlug, seoTittle, seoDescription } = req.body;
  if (!seoSlug || !seoTittle || !seoDescription) {
    return res.status(401).json({ message: "All Field Are Required" });
  }
  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Property ID" });
  }

  db.query("SELECT * FROM blogs WHERE id = ?", [Id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    db.query(
      "UPDATE blogs SET seoSlug = ?, seoTittle = ?, seoDescription = ? WHERE id = ?",
      [seoSlug, seoTittle, seoDescription, Id],
      (err, result) => {
        if (err) {
          console.error("Error While Add Seo Details:", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }
        res.status(200).json({ message: "Seo Details Add successfully" });
      },
    );
  });
};

// **Delete **
export const del = (req, res) => {
  const Id = parseInt(req.params.id);

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Blog ID" });
  }

  db.query("SELECT * FROM blogs WHERE id = ?", [Id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Blog not found" });
    }

    db.query("DELETE FROM blogs WHERE id = ?", [Id], (err) => {
      if (err) {
        console.error("Error deleting :", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      res.status(200).json({ message: "Blog deleted successfully" });
    });
  });
};
