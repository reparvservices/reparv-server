import express from "express";
import {
  getAllByCity,
} from "../controllers/trendingPropertiesController.js";

const router = express.Router();

router.get("/:city", getAllByCity);

export default router;
