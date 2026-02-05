import db from "../../config/dbconnect.js";

// LIKE / DISLIKE PROPERTY (Toggle)
export const propertyLike = (req, res) => {
  const userId = req.guestUser?.id;
  const { property_id } = req.body;

  if (!userId || !property_id) {
    return res.status(400).json({ message: "User or Property missing" });
  }

  // 1 Check already liked or not
  const checkSql = `
    SELECT id 
    FROM user_property_wishlist 
    WHERE guest_user_id = ? AND property_id = ?
  `;

  db.query(checkSql, [userId, property_id], (err, rows) => {
    if (err) {
      console.error("Check like error:", err);
      return res.status(500).json({ message: "Database error" });
    }

    // 2 If exists → DISLIKE
    if (rows.length > 0) {
      const deleteSql = `
        DELETE FROM user_property_wishlist 
        WHERE guest_user_id = ? AND property_id = ?
      `;

      db.query(deleteSql, [userId, property_id], (err) => {
        if (err) {
          console.error("Dislike error:", err);
          return res.status(500).json({ message: "Database error" });
        }

        return res.json({
          liked: false,
          message: "Property Disliked",
        });
      });
    }
    // 3 Else → LIKE
    else {
      const insertSql = `
        INSERT INTO user_property_wishlist (guest_user_id, property_id)
        VALUES (?, ?)
      `;

      db.query(insertSql, [userId, property_id], (err) => {
        if (err) {
          console.error("Like error:", err);
          return res.status(500).json({ message: "Database error" });
        }

        return res.json({
          liked: true,
          message: "Property Liked",
        });
      });
    }
  });
};

export const blogLike = (req, res) => {
  const userId = req.guestUser?.id;
  const { blog_id } = req.body;

  if (!userId || !blog_id) {
    return res.status(400).json({ message: "User or Blog ID missing" });
  }

  // 1 Check already liked or not
  const checkSql = `
    SELECT id 
    FROM user_blog_wishlist 
    WHERE guest_user_id = ? AND blog_id = ?
  `;

  db.query(checkSql, [userId, blog_id], (err, rows) => {
    if (err) {
      console.error("Check blog like error:", err);
      return res.status(500).json({ message: "Database error" });
    }

    // Already liked → DISLIKE
    if (rows.length > 0) {
      const deleteSql = `
        DELETE FROM user_blog_wishlist 
        WHERE guest_user_id = ? AND blog_id = ?
      `;

      db.query(deleteSql, [userId, blog_id], (err) => {
        if (err) {
          console.error("Remove blog like error:", err);
          return res.status(500).json({ message: "Database error" });
        }

        return res.json({
          liked: false,
          message: "Blog Disliked",
        });
      });
    } else {
      // Not liked → LIKE
      const insertSql = `
        INSERT INTO user_blog_wishlist (guest_user_id, blog_id)
        VALUES (?, ?)
      `;

      db.query(insertSql, [userId, blog_id], (err) => {
        if (err) {
          console.error("Add blog like error:", err);
          return res.status(500).json({ message: "Database error" });
        }

        return res.json({
          liked: true,
          message: "Blog Liked",
        });
      });
    }
  });
};
