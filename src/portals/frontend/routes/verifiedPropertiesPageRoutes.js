import express from "express";
import { getVerifiedPropertiesPageData } from "../controllers/verifiedPropertiesPageController.js";

const router = express.Router();

router.get("/:city", getVerifiedPropertiesPageData);

export default router;
