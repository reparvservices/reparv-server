import express from "express";
import { getWeekendVisitPageData } from "../controllers/weekendVisitController.js";

const router = express.Router();

router.get("/:city", getWeekendVisitPageData);

export default router;
