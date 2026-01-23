import express from "express";
import multer from "multer";
import path from "path";
import db from "../../config/dbconnect.js";
import { add, addLike, getAll, getAllByUser, updatePost } from "../../controllers/builderApp/PostController.js";

const router = express.Router();
/* ---------- MULTER CONFIG (S3) ---------- */
const upload = multer({
  storage: multer.memoryStorage(), //  IMPORTANT for S3
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/jpg"];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only JPEG, PNG, and JPG images are allowed"));
    }
    cb(null, true);
  },
});

router.get("/", getAll);
router.get("/getUserPosts", getAllByUser);
router.post("/add", upload.single("image"), add);
router.put("/addlike", addLike);
router.put("/updated/:id", upload.single("image"), updatePost);
// DELETE POST API
router.delete("/deletepost/:id", (req, res) => {
  const postId = req.params.id;

  const sql = "DELETE FROM builderposts WHERE postId = ?";

  db.query(sql, [postId], (err, result) => {
    if (err) {
      console.error("Error deleting post:", err);
      return res.status(500).json({ error: "Failed to delete post" });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Post not found" });
    }

    res.status(200).json({ message: "Post deleted successfully" });
  });
});

export default router;
