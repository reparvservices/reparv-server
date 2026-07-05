import express from "express";
import { getTopTrustedPropertiesPageData } from "../controllers/topTrustedPropertiesPageController.js";

const router = express.Router();

router.get("/:city", getTopTrustedPropertiesPageData);

export default router;
