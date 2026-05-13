import express from "express";
import { notifySubscriber } from "../controllers/notifycontroller.js";
const router = express.Router();
// POST /api/notify-subscriber
router.post("/", notifySubscriber);

export default router;
