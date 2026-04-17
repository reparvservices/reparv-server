import express from "express";
import {
  getAll,
  getAllByBudget,
  getAllByCity,
  getHotDealProperties,
  getTopPicksProperties,
} from "../controllers/allPropertiesController.js";

const router = express.Router();

router.get("/", getAll);
router.get("/:city", getAllByCity);
router.get("/budget/:city", getAllByBudget);
router.get("/hot-deal/:city", getHotDealProperties);
router.get("/top-picks/:city", getTopPicksProperties);

export default router;
