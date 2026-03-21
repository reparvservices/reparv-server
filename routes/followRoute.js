import express from "express";
import {
  getFollowCounts,
  getFollowers,
  getFollowing,
  getFollowStatus,
  getUserProfile,
  searchUsers,
  toggleFollow,
} from "../controllers/FollowController.js";

const router = express.Router();

// ── Follow / Unfollow ─────────────────────────────────────────
// POST /api/follow/toggle
// Body: { user_id, user_role, target_id, target_role }
router.post("/toggle", toggleFollow);

// ── Check follow status ───────────────────────────────────────
// GET /api/follow/status?user_id&user_role&target_id&target_role
router.get("/status", getFollowStatus);

// ── Follower / Following counts ───────────────────────────────
// GET /api/follow/counts?user_id&user_role
// ⚠️  Must be BEFORE /:anything routes
router.get("/counts", getFollowCounts);

// ── Followers list ────────────────────────────────────────────
// GET /api/follow/followers?user_id&user_role&page&limit
router.get("/followers", getFollowers);

// ── Following list ────────────────────────────────────────────
// GET /api/follow/following?user_id&user_role&page&limit
router.get("/following", getFollowing);

// ── View any user's profile ───────────────────────────────────
// GET /api/follow/profile?user_id&user_role&target_id&target_role
router.get("/profile", getUserProfile);

// ── Search users across all roles ────────────────────────────
// GET /api/follow/search?q=<name>&user_id&user_role&page&limit
router.get("/search", searchUsers);

export default router;
