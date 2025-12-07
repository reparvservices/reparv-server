import express from "express";

import {
  getAll,
  getById,
  add,
  edit,
  status,
  del,
  getUniqueSubscriptionPlans,
  getCities,
  getProjectPartnerByCity,
  getPropertiesByProject,
} from "../../controllers/admin/adsManagerController.js";

const router = express.Router();

// Custom Routes First
router.get("/subscription-plans", getUniqueSubscriptionPlans);
router.get("/cities", getCities);
router.post("/properties", getPropertiesByProject);
router.get("/project-partner/:city", getProjectPartnerByCity);

// Main CRUD Routes
router.get("/", getAll);
//router.get("/:id", getById);
//router.post("/add", add);
//router.put("/edit/:id", edit);
//router.put("/status/:id", status);
//router.delete("/delete/:id", del);

export default router;