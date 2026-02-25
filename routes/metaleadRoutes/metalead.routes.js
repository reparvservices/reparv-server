import express from "express";
import {
  verifyWebhook,
  handleWebhook,
} from "../../controllers/metacontroller/metalead.controller.js";

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

export default router;
