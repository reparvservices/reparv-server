import express from "express";
import compression from "compression";
import session from "express-session";
import cookieParser from "cookie-parser";
import path from "path";

import metaLeadRoutes from "./portals/metalead/routes/metalead.routes.js";
import "./portals/metalead/controllers/metalead.controller.js";
import whatsappChatWebhookRoutes from "./portals/webhooks/routes/whatsappChatWebhookRoutes.js";
import razorpayWebhookRoutes from "./portals/webhooks/routes/razorpayWebhookRoutes.js";
import { resolveWhatsappWebhookVerifyToken } from "./portals/webhooks/controllers/whatsappChatWebhookController.js";

import { attachCors } from "./core/http/cors.js";
import { verifyToken } from "./core/middleware/verifyToken.js";
import { requireActivePartnerSubscription } from "./core/middleware/requireActivePartnerSubscription.js";
import { mountPublicRoutes } from "./http/mountPublicRoutes.js";
import { mountProtectedRoutes } from "./http/mountProtectedRoutes.js";

const app = express();

/** Gzip/deflate JSON/HTML responses (skip small payloads). Override: DISABLE_COMPRESSION=1 */
if (process.env.DISABLE_COMPRESSION !== "1") {
  app.use(compression({ threshold: 2048 }));
}

const bodyLimit = process.env.BODY_LIMIT || "32mb";

app.use(
  session({
    secret: process.env.SESSION_SECRET || "your_secret_key",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true },
  }),
);

app.use(express.urlencoded({ extended: true, limit: bodyLimit }));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

attachCors(app);

// dont remove it form this place other wise it will not work
app.use("/meta", metaLeadRoutes);

/** Razorpay signs the raw body — mount before express.json() */
app.use(
  "/webhooks/razorpay",
  express.raw({ type: "application/json" }),
  razorpayWebhookRoutes,
);

app.use(express.json({ limit: bodyLimit }));

app.use("/webhooks/whatsapp-chat", whatsappChatWebhookRoutes);
if (!resolveWhatsappWebhookVerifyToken()) {
  console.warn(
    "[webhooks/whatsapp-chat] WHATSAPP_WEBHOOK_VERIFY_TOKEN (or VERIFY_TOKEN) is not set — Meta callback URL verification will return 403 until it is set in the process environment.",
  );
}

app.use(cookieParser());

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Backend is running successfully update 1.1.1.1!",
  });
});

app.get("/get-cookie", (req, res) => {
  console.log("Cookies:", req.cookies);
  res.json({ cookies: req.cookies });
});

mountPublicRoutes(app);

app.use(verifyToken);
app.use(requireActivePartnerSubscription);
mountProtectedRoutes(app);

export default app;
