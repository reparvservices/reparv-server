import express from "express";
import {
  verifyWebhook,
  handleWebhook,
} from "../../controllers/metacontroller/metalead.controller.js";
import {
  getAllLeads,
  deleteLead,
} from "../../controllers/metacontroller/meta.controller.js";

const router = express.Router();

router.get(
  "/webhook",
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
  verifyWebhook,
);

router.post(
  "/webhook",
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
