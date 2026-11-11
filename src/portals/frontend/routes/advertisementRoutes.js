import express from "express";
import { getLive, trackClick } from "../../admin/controllers/advertisementController.js";

const router = express.Router();

// GET /frontend/advertisements?city=Nagpur
router.get("/", getLive);
// POST /frontend/advertisements/click/:id
router.post("/click/:id(\\d+)", trackClick);

export default router;
