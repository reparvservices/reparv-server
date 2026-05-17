import {
  listGstInvoices,
  getGstInvoiceById,
  getGstSummaryMtd,
  backfillMissingInvoices,
} from "../../services/gstInvoice.service.js";
import { streamGstInvoicePdf } from "../../services/gstInvoicePdf.js";

export const listGstInvoicesHandler = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const { role, search, from, to, subscription_status } = req.query;

    const data = await listGstInvoices({
      page,
      limit,
      role: role || undefined,
      search: search || undefined,
      fromDate: from || undefined,
      toDate: to || undefined,
      subscriptionStatus: subscription_status || undefined,
    });

    const summary = await getGstSummaryMtd();

    return res.status(200).json({
      success: true,
      summary,
      ...data,
    });
  } catch (error) {
    console.error("listGstInvoices:", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to list GST invoices",
    });
  }
};

export const getGstInvoiceHandler = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }
    const invoice = await getGstInvoiceById(id);
    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }
    return res.status(200).json({ success: true, invoice });
  } catch (error) {
    console.error("getGstInvoice:", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to fetch invoice",
    });
  }
};

export const downloadGstInvoicePdf = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }
    const invoice = await getGstInvoiceById(id);
    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }
    streamGstInvoicePdf(res, invoice);
  } catch (error) {
    console.error("downloadGstInvoicePdf:", error);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: error?.message || "Failed to generate PDF",
      });
    }
  }
};

export const backfillGstInvoices = async (req, res) => {
  try {
    const limit = Math.min(500, parseInt(req.body?.limit, 10) || 100);
    const result = await backfillMissingInvoices(limit);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("backfillGstInvoices:", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "Backfill failed",
    });
  }
};
