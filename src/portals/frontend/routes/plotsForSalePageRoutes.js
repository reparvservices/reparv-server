import express from "express";
import { getPlotsForSalePageData } from "../controllers/plotsForSalePageController.js";

const router = express.Router();

router.get("/:city", getPlotsForSalePageData);

export default router;
