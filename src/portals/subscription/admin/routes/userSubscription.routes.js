import express from "express";
import {
  assignEnterpriseSubscriptionAdmin,
  cancelUserSubscriptionAdmin,
  getUserSubscriptionInvoices,
  getUserSubscriptionPayments,
  listUserSubscriptions,
  syncUserSubscriptionPayments,
} from "../controllers/userSubscription.controller.js";

const router = express.Router();

router.get("/", listUserSubscriptions);
router.post("/assign", assignEnterpriseSubscriptionAdmin);
router.post("/:id/cancel", cancelUserSubscriptionAdmin);
router.get("/:id/payments", getUserSubscriptionPayments);
router.post("/:id/payments/sync", syncUserSubscriptionPayments);
router.get("/:id/invoices", getUserSubscriptionInvoices);

export default router;
