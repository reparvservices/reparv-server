import express from "express";
import {
  getPublicFeed,
  getPublicComments,
  toggleCustomerLike,
  addCustomerComment,
  getLikedPostIds,
} from "../controllers/feedController.js";
import { requireCustomer } from "../../../core/middleware/requireCustomer.js";

const router = express.Router();

router.get("/posts", getPublicFeed);
router.get("/posts/liked", requireCustomer, getLikedPostIds); // before /posts/:id/*
router.get("/posts/:id/comments", getPublicComments);
router.post("/posts/:id/like", requireCustomer, toggleCustomerLike);
router.post("/posts/:id/comments", requireCustomer, addCustomerComment);

export default router;
