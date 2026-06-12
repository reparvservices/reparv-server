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
import { getPartnerAppUrls } from "./portals/frontend/services/partnerJoinLead.service.js";

const app = express();

/** Gzip/deflate JSON/HTML responses (skip small payloads). Override: DISABLE_COMPRESSION=1 */
if (process.env.DISABLE_COMPRESSION !== "1") {
  app.use(compression({ threshold: 2048 }));
}

const bodyLimit = process.env.BODY_LIMIT || "100mb";

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
//deeplink.js
app.get("/open", (req, res) => {
  const { id, role, name } = req.query;

  const deepLink = `reparv://UserProfile/${id}?role=${role}&name=${encodeURIComponent(name)}`;
  const playStoreUrl =
    "https://play.google.com/store/apps/details?id=com.reparvprojectpartner";
  const appStoreUrl =
    "https://play.google.com/store/apps/details?id=com.reparvprojectpartner";

  // Detect device and redirect accordingly
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Opening Reparv...</title>
      <meta property="og:title" content="${name} — Reparv Partner" />
      <meta property="og:description" content="View ${name}'s profile on Reparv" />
      <meta property="og:image" content="https://reparv.com/og-preview.png" />
    </head>
    <body>
      <script>
        const ua = navigator.userAgent.toLowerCase();
        const isAndroid = /android/.test(ua);
        const isIOS = /iphone|ipad/.test(ua);

        // Try opening the app
        window.location.href = "${deepLink}";

        // If app not installed, fallback to store after 2s
        setTimeout(() => {
          if (isAndroid) window.location.href = "${playStoreUrl}";
          else if (isIOS) window.location.href = "${appStoreUrl}";
          else window.location.href = "https://reparv.com";
        }, 2000);
      </script>
      <p>Opening Reparv app...</p>
    </body>
    </html>
  `);
});

app.get("/partner-app/join", (req, res) => {
  const token = String(req.query.token || "");
  const { playStore, appStore } = getPartnerAppUrls();
  const deepLink = token
    ? `reparv://register?token=${encodeURIComponent(token)}`
    : "reparv://register";

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Reparv Partner App</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta property="og:title" content="Complete your Reparv Partner registration" />
      <meta property="og:description" content="Download the Reparv Partner app to finish registration" />
    </head>
    <body style="font-family: system-ui, sans-serif; text-align: center; padding: 2rem;">
      <h1>Opening Reparv Partner…</h1>
      <p>If the app does not open, you will be redirected to the app store.</p>
      <script>
        const ua = navigator.userAgent.toLowerCase();
        const isAndroid = /android/.test(ua);
        const isIOS = /iphone|ipad/.test(ua);
        window.location.href = "${deepLink}";
        setTimeout(() => {
          if (isAndroid) window.location.href = "${playStore}";
          else if (isIOS) window.location.href = "${appStore}";
          else window.location.href = "${playStore}";
        }, 2000);
      </script>
    </body>
    </html>
  `);
});

app.get("/ai-chat", (req, res) => {
  res.redirect(301, "/agent");
});

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
