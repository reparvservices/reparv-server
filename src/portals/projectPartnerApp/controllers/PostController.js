import db from "#db";
import moment from "moment-timezone";
import { convertSingleImageToWebp } from "#utils/convertSingleImageToWebp.js";
import { uploadToS3 } from "#utils/imageUpload.js";

// **Fetch All**
export const getAll = (req, res) => {
  const sql = `
SELECT
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
  projectpartnerposts p
LEFT JOIN 
  projectpartner u ON p.userId = u.id
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
    projectpartnerposts p
JOIN 
    projectpartner u ON p.userId = u.id
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

// **Add New **
export const add = async (req, res) => {
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

  // image is already an S3 URL uploaded directly by the client
  const imageUrl = image || null;
  console.log(imageUrl);

  const sql = `
    INSERT INTO projectpartnerposts
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
        console.error("[add] Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      return res.status(201).json({
        message: "Post added successfully",
        postId: result.insertId,
        image: imageUrl,
      });
    },
  );
};

export const addLike = async (req, res) => {
  const { postId } = req.body;
  console.log(postId, "pppppp");

  if (!postId) {
    return res.status(400).json({ message: "postId is required" });
  }

  // Step 1: Check if post exists
  db.query(
    "SELECT * FROM projectpartnerposts WHERE postId = ?",
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
        "UPDATE projectpartnerposts SET likes = likes + 1 WHERE postId = ?",
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

export const updatePost = async (req, res) => {
  const postId = req.params.id;
  const { postContent, image } = req.body;

  if (!postId) {
    return res.status(400).json({ message: "Post ID is required" });
  }

  // image is an S3 URL already uploaded by the client — no server-side upload needed
  const imageUrl = image || null;

  if (!imageUrl && !postContent?.trim()) {
    return res.status(400).json({ message: "Nothing to update" });
  }

  let sql;
  let values;

  if (imageUrl && postContent?.trim()) {
    sql =
      "UPDATE projectpartnerposts SET image = ?, postContent = ? WHERE postId = ?";
    values = [imageUrl, postContent.trim(), postId];
  } else if (imageUrl) {
    sql = "UPDATE projectpartnerposts SET image = ? WHERE postId = ?";
    values = [imageUrl, postId];
  } else {
    sql = "UPDATE projectpartnerposts SET postContent = ? WHERE postId = ?";
    values = [postContent.trim(), postId];
  }

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
      updatedRows: result.affectedRows,
      image: imageUrl || undefined,
    });
  });
};
