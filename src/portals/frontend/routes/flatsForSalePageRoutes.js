import express from "express";
import { getFlatsForSalePageData } from "../controllers/flatsForSalePageController.js";

const router = express.Router();

router.get("/:city", getFlatsForSalePageData);

export default router;
