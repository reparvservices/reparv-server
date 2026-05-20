import express from "express";
import {
  listGstInvoicesHandler,
  getGstInvoiceHandler,
  downloadGstInvoicePdf,
  backfillGstInvoices,
} from "../controllers/gstInvoice.controller.js";

const router = express.Router();

router.get("/", listGstInvoicesHandler);
router.post("/backfill", backfillGstInvoices);
router.get("/:id/pdf", downloadGstInvoicePdf);
router.get("/:id", getGstInvoiceHandler);

export default router;
