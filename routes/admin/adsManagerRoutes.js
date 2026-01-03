import express from "express";

import {
  getAll,
  getByPropertyId,
  add,
  edit,
  status,
  del,
  getUniqueSubscriptionPlans,
  getCities,
  getProjectPartnerByCity,
  getPropertiesByProject,
  updateAdURL,
} from "../../controllers/admin/adsManagerController.js";

const router = express.Router();

// Custom Routes First
router.get("/subscription-plans", getUniqueSubscriptionPlans);
router.get("/cities", getCities);
router.post("/properties", getPropertiesByProject);
router.get("/project-partner/:city", getProjectPartnerByCity);
router.put("/update/ad-url/:id", updateAdURL);

// Main CRUD Routes
router.get("/", getAll);
router.get("/:id", getByPropertyId);
//router.post("/add", add);
//router.put("/edit/:id", edit);
//router.put("/status/:id", status);
//router.delete("/delete/:id", del);

export default router;