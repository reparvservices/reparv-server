import express from "express";
import { getFamilyDecisionStoriesPageData } from "../controllers/familyDecisionStoriesPageController.js";

const router = express.Router();

router.get("/:city", getFamilyDecisionStoriesPageData);

export default router;
