// routes/eventRoutes.js
import express from "express";
import {
  createEvent,
  getActiveEvents,
  getEvents,
  deleteEvent,
  updateEvent,
  changeEventStatus,
  getAnalytics,
  getEventAnalytics,
} from "../../controllers/eventController/eventController.js";

const router = express.Router();

router.post("/create", createEvent);
router.get("/:id", getEvents);
router.get("/", getActiveEvents);
router.delete("/:eventId", deleteEvent); // DELETE single event
router.put("/:eventId", updateEvent); // UPDATE event fields
router.patch("/:eventId/status", changeEventStatus); // CHANGE status only
// router
router.get("/analytics/:userId", getAnalytics);
router.get("/analytics/event/:eventId", getEventAnalytics);

export default router;
