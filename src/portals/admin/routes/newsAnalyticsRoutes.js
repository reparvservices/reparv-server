import express from "express";
import {
  addNewsVisitor,
  getTotalNewsVisitors,
} from "../controllers/newsAnalyticsController.js";

const router = express.Router();

router.post("/addvisits", addNewsVisitor);
router.get("/getvisits", getTotalNewsVisitors);

export default router;
