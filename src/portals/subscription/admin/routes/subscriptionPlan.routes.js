import express from "express";
import {
  createPlan,
  deletePlan,
  getAllPlans,
  getPlansByPartnerType,
  getPlanById,
  updatePlan,
} from "../controllers/subscriptionPlan.controller.js";

const router = express.Router();

router.get("/", getAllPlans);
router.get("/partner/:partnerType", getPlansByPartnerType);
router.get("/:id", getPlanById);
router.post("/add", createPlan);
router.put("/edit/:id", updatePlan);
router.delete("/delete/:id", deletePlan);

export default router;
