import express from "express";
import {
  addVisitor,
  getTotalVisitors,
} from "../controllers/propertyAnalyticsController.js";

const router = express.Router();

router.post("/addvisits", addVisitor);
router.get("/getvisits", getTotalVisitors);

export default router;
