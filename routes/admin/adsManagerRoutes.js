import express from "express";

import {
  getAll,
  getById,
  add,
  edit,
  status,
  del,
  fetchProjectPartnerData,
} from "../../controllers/admin/adsManagerController.js";

const router = express.Router();

// Routes
router.get("/", getAll);
router.get("/:id", getById);
router.get("/project-partner/:id", fetchProjectPartnerData);
router.post("/add", add);
router.put("/edit/:id", edit);
router.put("/status/:id", status);
router.delete("/delete/:id", del);

export default router;
