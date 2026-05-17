import express from "express";
import {
  createFeature,
  deleteFeature,
  getAllFeatures,
  getFeatureById,
  updateFeature,
} from "../controllers/subscriptionFeature.controller.js";

const router = express.Router();

router.get("/", getAllFeatures);
router.get("/:id", getFeatureById);
router.post("/add", createFeature);
router.put("/edit/:id", updateFeature);
router.delete("/delete/:id", deleteFeature);

export default router;
