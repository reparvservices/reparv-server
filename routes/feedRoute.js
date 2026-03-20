// ============================================================
//  feedRoutes.js  –  ES Module
//  No multer — all media URLs arrive pre-uploaded from the client
//  Mount at:  app.use('/api/feed', feedRoutes)
// ============================================================

import { Router } from "express";
import {
  getFeedPosts,
  getUserPosts,
  createPost,
  updatePost, // ← new
  deletePost,
  toggleLike,
  getComments,
  addComment,
  getStories,
  createStory,
  deleteStory,
  viewStory,
  getStoryViewers,
  replyToStory,
  toggleFollow,
  getNotifications,
  getUnreadCount,
} from "../controllers/feedController.js";

const router = Router();

// ── Posts ─────────────────────────────────────────────────────
// ⚠️  /posts/my MUST come before /posts/:id
router.get("/posts/my", getUserPosts); // own posts (PostGrid)
router.get("/posts", getFeedPosts); // all feed posts
router.post("/posts", createPost);
router.put("/posts/:id", updatePost); // ← new
router.delete("/posts/:id", deletePost);

// ── Likes ─────────────────────────────────────────────────────
router.post("/posts/:id/like", toggleLike);

// ── Comments ──────────────────────────────────────────────────
router.get("/posts/:id/comments", getComments);
router.post("/posts/:id/comments", addComment);

// ── Stories ───────────────────────────────────────────────────
router.get("/stories", getStories);
router.post("/stories", createStory);
router.delete("/stories/:id", deleteStory);
router.post("/stories/:id/view", viewStory);
router.get("/stories/:id/views", getStoryViewers);
router.post("/stories/:id/reply", replyToStory);

// ── Follow ────────────────────────────────────────────────────
router.post("/follow", toggleFollow);

// ── Notifications ─────────────────────────────────────────────
router.get("/notifications", getNotifications);
router.get("/notifications/unread-count", getUnreadCount);

export default router;
