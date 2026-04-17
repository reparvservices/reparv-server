import db from "#db";
import moment from "moment-timezone";
import { deleteFromS3, uploadToS3 } from "#utils/imageUpload.js";
import { convertSingleImageToWebp } from "#utils/convertSingleImageToWebp.js";

// **Fetch All**
export const getAll = (req, res) => {
  console.log("dddddd");

  const sql = `
SELECT
  p.postId,
  p.userId,
  p.postContent,
  p.image,
  p.projectpartnerid,
  p.likes,
  p.created_at,
  u.fullname,
  u.city,
  u.userimage
FROM 
  salespersonposts p
LEFT JOIN 
  salespersons u ON p.userId = u.salespersonsid
ORDER BY 
  p.created_at DESC;

`;

  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    console.log(result);

    res.json(result);
  });
};

//get user created post
export const getAllByUser = (req, res) => {
  const userId = req.query.id; // ← Here you get the userId from query string

  const sql = `SELECT DISTINCT
    p.postId,
    p.userId,
    p.postContent,
    p.image,
    p.likes,
    p.projectpartnerid,
    p.created_at,
    u.fullname,
    u.city,
    u.userimage
FROM 
    salespersonposts p
JOIN 
    salespersons u ON p.userId = u.salespersonsid
WHERE 
    p.userId = ?
ORDER BY 
    p.created_at DESC;
 `;
  db.query(sql, [userId], (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    return res.json(result);
  });
};

export const addLike = async (req, res) => {
  const { postId } = req.body;
  console.log(postId, "pppppp");

  if (!postId) {
    return res.status(400).json({ message: "postId is required" });
  }

  // Step 1: Check if post exists
  db.query(
    "SELECT * FROM salespersonposts WHERE postId = ?",
    [postId],
    (err, result) => {
      if (err) {
        console.log("Error checking post:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      if (!result || result.length === 0) {
        return res.status(404).json({ message: "Post not found" });
      }

      // Step 2: Update like count
      db.query(
        "UPDATE salespersonposts SET likes = likes + 1 WHERE postId = ?",
        [postId],
        (err2, result2) => {
          if (err2) {
            console.log("Error updating likes:", err2);
            return res
              .status(500)
              .json({ message: "Failed to update likes", error: err2 });
          }

          return res.status(200).json({ message: "Post liked successfully" });
        },
      );
    },
  );
};

export const add = async (req, res) => {
  try {
    const currentDate = moment().format("YYYY-MM-DD HH:mm:ss");
    const { userId, postContent, like, projectpartnerid, image } = req.body;
    console.log(req.body);

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    if (!image && !postContent?.trim()) {
      return res
        .status(400)
        .json({ message: "Either image or post content is required" });
    }

    // image is an S3 URL already uploaded by the client
    const imageUrl = image || null;

    const sql = `
      INSERT INTO salespersonposts
      (userId, image, postContent, likes, projectpartnerid, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.query(
      sql,
      [
        userId,
        imageUrl,
        postContent?.trim() || null,
        like || 0,
        projectpartnerid || null,
        currentDate,
      ],
      (err, result) => {
        if (err) {
          if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ message: "Duplicate post" });
          }
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }

        return res.status(201).json({
          message: "Post added successfully",
          postId: result.insertId,
          image: imageUrl,
        });
      },
    );
  } catch (error) {
    console.error("[add] error:", error);
    return res.status(500).json({ message: "Server error", error });
  }
};

export const updatePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const { postContent, image } = req.body;

    if (!postId) {
      return res.status(400).json({ message: "Post ID is required" });
    }

    // image is an S3 URL already uploaded by the client
    const newImageUrl = image || null;

    if (!newImageUrl && !postContent?.trim()) {
      return res.status(400).json({ message: "Nothing to update" });
    }

    // Build dynamic SET clause
    let sql = "UPDATE salespersonposts SET updated_at = NOW()";
    const values = [];

    if (newImageUrl) {
      sql += ", image = ?";
      values.push(newImageUrl);
    }

    if (postContent?.trim()) {
      sql += ", postContent = ?";
      values.push(postContent.trim());
    }

    sql += " WHERE postId = ?";
    values.push(postId);

    db.query(sql, values, (err, result) => {
      if (err) {
        console.error("[updatePost] DB error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Post not found" });
      }

      return res.status(200).json({
        message: "Post updated successfully",
        image: newImageUrl || undefined,
      });
    });
  } catch (error) {
    console.error("[updatePost] error:", error);
    return res.status(500).json({ message: "Server error", error });
  }
};
