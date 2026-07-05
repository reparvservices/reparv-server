import express from "express";
import { getReadyToMovePageData } from "../controllers/readyToMovePageController.js";

const router = express.Router();

router.get("/:city", getReadyToMovePageData);

export default router;
