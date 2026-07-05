import express from "express";
import { getRentalPropertiesPageData } from "../controllers/rentalPropertiesPageController.js";

const router = express.Router();

router.get("/:city", getRentalPropertiesPageData);

export default router;
