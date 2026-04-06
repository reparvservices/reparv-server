// routes/eventRoutes.js
import express from "express";
import {
  createEvent,
  getEvents,
} from "../../controllers/eventController/eventController.js";
const router = express.Router();

router.post("/create", createEvent);
router.get("/:id", getEvents);

export default router;
