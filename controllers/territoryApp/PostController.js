import db from "../../config/dbconnect.js";
import moment from "moment";
import { deleteFromS3, uploadToS3 } from "../../utils/imageUpload.js";

// **Fetch All**
export const getAll = (req, res) => {
  console.log("dddddd");

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
  territorypartnerposts p
LEFT JOIN 
  territorypartner u ON p.userId = u.id
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
    territorypartnerposts p
JOIN 
    territorypartner u ON p.userId = u.id
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
  try {
    const currentDate = moment().format("YYYY-MM-DD HH:mm:ss");
    const { userId, postContent, like, projectpartnerid } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    if (!req.file && !postContent) {
      return res
        .status(400)
        .json({ message: "Either image or post content is required" });
    }

    /* ---------- UPLOAD IMAGE TO S3 ---------- */
    let imageUrl = null;
    if (req.file) {
      imageUrl = await uploadToS3(req.file);
    }

    const sql = `
      INSERT INTO territorypartnerposts
      (userId, image, postContent, likes, projectpartnerid, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.query(
      sql,
      [
        userId,
        imageUrl,
        postContent || null,
        like || 0,
        projectpartnerid || null,
        currentDate,
      ],
      (err, result) => {
        if (err) {
          if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ message: "Duplicate post" });
          }
          return res.status(500).json({
            message: "Database error",
            error: err,
          });
        }

        return res.status(201).json({
          message: "Post added successfully",
          postId: result.insertId,
        });
      },
    );
  } catch (error) {
    console.error("Add post error:", error);
    return res.status(500).json({
      message: "Server error while adding post",
      error,
    });
  }
};

export const addLike = async (req, res) => {
  const { postId } = req.body;
  console.log(postId, "pppppp");

  if (!postId) {
    return res.status(400).json({ message: "postId is required" });
  }

  // Step 1: Check if post exists
  db.query(
    "SELECT * FROM territorypartnerposts WHERE postId = ?",
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
        "UPDATE territorypartnerposts SET likes = likes + 1 WHERE postId = ?",
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
  try {
    const postId = req.params.id;
    const { postContent } = req.body;

    if (!postId) {
      return res.status(400).json({ message: "Post ID is required" });
    }

    /* ---------- GET EXISTING POST ---------- */
    const getSql = `SELECT image FROM territorypartnerposts WHERE postId = ?`;

    db.query(getSql, [postId], async (fetchErr, rows) => {
      if (fetchErr) {
        return res.status(500).json({
          message: "Database error while fetching post",
          error: fetchErr,
        });
      }

      if (rows.length === 0) {
        return res.status(404).json({ message: "Post not found" });
      }

      let newImageUrl = null;

      /* ---------- UPLOAD NEW IMAGE ---------- */
      if (req.file) {
        newImageUrl = await uploadToS3(req.file);

        // 🗑 Delete old image from S3
        if (rows[0].image) {
          await deleteFromS3(rows[0].image);
        }
      }

      /* ---------- BUILD UPDATE QUERY ---------- */
      let updateSql = `UPDATE territorypartnerposts SET updated_at = NOW()`;
      const values = [];

      if (newImageUrl) {
        updateSql += `, image = ?`;
        values.push(newImageUrl);
      }

      if (postContent) {
        updateSql += `, postContent = ?`;
        values.push(postContent);
      }

      if (!newImageUrl && !postContent) {
        return res.status(400).json({ message: "No data provided to update" });
      }

      updateSql += ` WHERE postId = ?`;
      values.push(postId);

      db.query(updateSql, values, (updateErr) => {
        if (updateErr) {
          return res.status(500).json({
            message: "Database error during update",
            error: updateErr,
          });
        }

        return res.status(200).json({
          message: "Post updated successfully",
        });
      });
    });
  } catch (error) {
    console.error("Update post error:", error);
    return res.status(500).json({
      message: "Server error while updating post",
      error,
    });
  }
};
