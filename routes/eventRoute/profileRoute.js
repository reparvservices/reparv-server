import express from "express";
import { getUserProfile } from "../../controllers/eventController/profileController.js";
const router = express.Router();

//get PRofile
router.get("/:id", getUserProfile);
export default router;
