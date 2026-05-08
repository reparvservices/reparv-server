import express from "express";
import {
  createFeature,
  deleteFeature,
  getAllFeatures,
  getFeatureById,
  updateFeature,
} from "../controllers/featureController.js";

const router = express.Router();

router.get("/", getAllFeatures);
router.get("/:id", getFeatureById);
router.post("/add", createFeature);
router.put("/edit/:id", updateFeature);
router.delete("/delete/:id", deleteFeature);

export default router;
