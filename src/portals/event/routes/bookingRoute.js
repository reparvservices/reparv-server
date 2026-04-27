import express from "express";
import {
  cancelBooking,
  createBooking,
  createRazorpayOrder,
  getBookingById,
  getMyBookings,
} from "../controllers/BookedTicketController.js";

const router = express.Router();

router.post("/book/:id", createBooking);
router.get("/my/:user_id", getMyBookings);
router.get("/:id/:user_id", getBookingById);
router.patch("/:id/cancel/:user_id", cancelBooking);
router.post("/create-order", createRazorpayOrder);

export default router;
