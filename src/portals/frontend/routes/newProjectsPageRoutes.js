import express from "express";
import { getNewProjectsPageData } from "../controllers/newProjectsPageController.js";

const router = express.Router();

router.get("/:city", getNewProjectsPageData);

export default router;
