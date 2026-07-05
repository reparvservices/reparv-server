import express from "express";
import { getBudgetToDreamHomePageData } from "../controllers/budgetToDreamHomePageController.js";

const router = express.Router();

router.get("/:city", getBudgetToDreamHomePageData);

export default router;
