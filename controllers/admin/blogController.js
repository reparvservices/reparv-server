import db from "../../config/dbconnect.js";
import moment from "moment";
import bcrypt from "bcryptjs";
import { uploadToS3 } from "../../utils/imageUpload.js";

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
  const sql = "SELECT * FROM blogs ORDER BY created_at DESC";
  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    const formatted = result.map((row) => ({
      ...row,
      created_at: moment(row.created_at).format("DD MMM YYYY | hh:mm A"),
      updated_at: moment(row.updated_at).format("DD MMM YYYY | hh:mm A"),
    }));

    res.json(formatted);
  });
};

// **Fetch All**
export const getAllActive = (req, res) => {
  const sql = "SELECT * FROM blogs WHERE status = 'Active' ORDER BY id DESC";
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
  const sql = "SELECT * FROM blogs WHERE id = ?";

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Blog not found" });
    }
    res.json(result[0]);
  });
};

// **Add New **
export const add = async (req, res) => {
  try {
    const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
    const { type, tittle, description, content } = req.body;

    /*  Validation */
    if (!tittle || !description || !content) {
      return res.status(400).json({ message: "All Fields are Required" });
    }

    const seoSlug = toSlug(tittle);

    /*  Upload blog image to S3 */
    const uploadBlogImage = async () => {
      if (!req.files?.blogImage?.[0]) return null;
      return await uploadToS3(req.files.blogImage[0], "blogs");
    };

    const blogImageUrl = await uploadBlogImage();

    /*  Insert blog */
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
    });
  } catch (error) {
    console.error("Error inserting blog:", error);
    return res.status(500).json({
      message: "Server error",
      error,
    });
  }
};
// **Edit **
export const edit = async (req, res) => {
  try {
    const blogId = req.params.id;
    if (!blogId) {
      return res.status(400).json({ message: "Invalid Blog ID" });
    }

    const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
    const { type, tittle, description, content } = req.body;

    /*  Validation */
    if (!tittle || !description || !content) {
      return res.status(400).json({ message: "All fields are required" });
    }

    /*  Upload new image to S3 (if provided) */
    let blogImageUrl = null;
    if (req.files?.blogImage?.[0]) {
      blogImageUrl = await uploadToS3(req.files.blogImage[0], "blogs");
    }

    /*  Build update query dynamically */
    let updateSql = `
      UPDATE blogs 
      SET type = ?, tittle = ?, description = ?, content = ?, updated_at = ?
    `;
    const updateValues = [
      type,
      tittle,
      description,
      content,
      currentdate,
    ];

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
    });
  } catch (error) {
    console.error("Error updating blog:", error);
    return res.status(500).json({
      message: "Server error",
      error,
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
