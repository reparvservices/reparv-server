import express from "express";
import {
  verifyWebhook,
  handleWebhook,
} from "../controllers/metalead.controller.js";
import {
  getAllLeads,
  deleteLead,
} from "../controllers/meta.controller.js";

const router = express.Router();

const logWebhookHit = (req, _res, next) => {
  const hasSig = Boolean(req.headers["x-hub-signature-256"]);
  console.log(
    `[META LEAD] ${req.method} ${req.originalUrl || req.url} — signature header: ${hasSig ? "yes" : "no"}`,
  );
  next();
};

router.get(
  "/webhook",
  logWebhookHit,
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
  verifyWebhook,
);

router.post(
  "/webhook",
  logWebhookHit,
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
  handleWebhook,
);

router.get("/", getAllLeads);
router.delete("/delete-lead/:id", deleteLead);

export default router;
