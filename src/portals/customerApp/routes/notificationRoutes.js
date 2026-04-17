import express from "express";
import saveFcmToken from "../controllers/notificationController.js";
const router = express.Router();

router.post("/save-fcm-token", saveFcmToken);

export default router;
