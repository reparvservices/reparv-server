import express from "express";
import { getFirstTimeBuyerPageData } from "../controllers/firstTimeBuyerPageController.js";

const router = express.Router();

router.get("/:city", getFirstTimeBuyerPageData);

export default router;
