import express from "express";
import {
  addBlogVisitor,
  getTotalBlogVisitors,
} from "../controllers/blogAnalyticsController.js";

const router = express.Router();

router.post("/addvisits", addBlogVisitor);
router.get("/getvisits", getTotalBlogVisitors);

export default router;
