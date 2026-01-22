import db from "../../config/dbconnect.js";
import moment from "moment";

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
  onboardingPartnerPosts p
LEFT JOIN 
  onboardingpartner u ON p.userId = u.partnerid
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
    onboardingPartnerPosts p
JOIN 
    onboardingpartner u ON p.userId = u.partnerid
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
export const add = (req, res) => {
  const currentDate = moment().format("YYYY-MM-DD HH:mm:ss");
  console.log("add");

  const { userId, postContent, like,projectpartnerid } = req.body;
  const imageFile = req.file?.filename;
  console.log(userId);

  if (!userId) {
    return res.status(400).json({ message: "User ID is required" });
  }

  if (!imageFile && !postContent) {
    console.log("err");

    return res
      .status(400)
      .json({ message: "Either image or post content is required" });
  }

  const finalImagePath = imageFile ? `/uploads/${imageFile}` : null;

  const sql = `
    INSERT INTO onboardingPartnerPosts (userId, image, postContent, likes,projectpartnerid, created_at)
    VALUES (?, ?, ?, ?, ?,?)
  `;

  db.query(
    sql,
    [userId, finalImagePath, postContent, like || 0,projectpartnerid || null, currentDate],
    (err, result) => {
      if (err) {
        if (err.code === "ER_DUP_ENTRY") {
          console.log("Er1", err);

          return res.status(409).json({ message: "Duplicate post" });
        }
        console.log("Er2", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      return res.status(201).json({
        message: "Post added successfully",
        postId: result.insertId,
      });
    }
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
    "SELECT * FROM onboardingPartnerPosts WHERE postId = ?",
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
        "UPDATE onboardingPartnerPosts SET likes = likes + 1 WHERE postId = ?",
        [postId],
        (err2, result2) => {
          if (err2) {
            console.log("Error updating likes:", err2);
            return res
              .status(500)
              .json({ message: "Failed to update likes", error: err2 });
          }

          return res.status(200).json({ message: "Post liked successfully" });
        }
      );
    }
  );
};

// Update Post Controller
export const updatePost = (req, res) => {
  const postId = req.params.id;
  const { postContent } = req.body;
  const image = req.file ? req.file.filename : null;

  let sql;
  let values;

  if (image && postContent) {
    const finalImagePath = `/uploads/${image}`;
    sql =
      "UPDATE onboardingPartnerPosts SET image = ?, postContent = ? WHERE postId = ?";
    values = [finalImagePath, postContent, postId];
  } else if (image) {
    const finalImagePath = `/uploads/${image}`;
    sql = "UPDATE onboardingPartnerPosts SET image = ? WHERE postId = ?";
    values = [finalImagePath, postId];
  } else if (postContent) {
    sql = "UPDATE onboardingPartnerPosts SET postContent = ? WHERE postId = ?";
    values = [postContent, postId];
  } else {
    return res.status(400).json({ message: "Nothing to update" });
  }

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("Error updating post:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Post not found" });
    }

    res.status(200).json({
      message: "Post updated successfully",
      updatedRows: result.affectedRows,
    });
  });
};
