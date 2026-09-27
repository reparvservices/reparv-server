import express from "express";
import {
  getData,
  getCount,
  getSummary,
  getUsersOverview,
} from "../controllers/dashboardController.js";

const router = express.Router();

router.get("/", getData);
router.get("/count", getCount);
router.get("/summary", getSummary);
router.get("/users-overview", getUsersOverview);

export default router;
