import express from "express";
import { getData, getCount, getSummary } from "../controllers/dashboardController.js";

const router = express.Router();

router.get("/", getData);
router.get("/count", getCount);
router.get("/summary", getSummary);

export default router;
