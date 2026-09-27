import crypto from "crypto";
import {
  logInboundMessage,
  resolveEnquiryByPhone,
  normalizePhoneE164,
} from "#utils/whatsappAdminChat.js";

function extractIncomingMessages(body) {
  const out = [];
  const entries = body?.entry || [];

  for (const ent of entries) {
    const changes = ent?.changes || [];
    for (const ch of changes) {
      const value = ch?.value || {};
      const messages = value?.messages || [];
      for (const m of messages) {
        const from = m?.from;
        const id = m?.id;
        let textBody = "";

        // Keep every message type readable in the admin chat
        const media = m?.[m?.type] || {};
        if (m?.type === "text" && m?.text?.body) {
          textBody = m.text.body;
        } else if (m?.type === "interactive") {
          const reply = m.interactive?.button_reply || m.interactive?.list_reply;
          textBody = reply?.title ? `[reply] ${reply.title}` : "[interactive message]";
        } else if (m?.type === "button") {
          textBody = m.button?.text ? `[button] ${m.button.text}` : "[button]";
        } else if (["image", "video", "document", "audio", "sticker"].includes(m?.type)) {
          const detail = media.caption || media.filename || "";
          textBody = `[${m.type}]${detail ? ` ${detail}` : ""}`;
        } else if (m?.type === "location" && m.location) {
          const { latitude, longitude, name, address } = m.location;
          textBody = `[location] ${[name, address].filter(Boolean).join(", ") || `${latitude}, ${longitude}`}`;
        } else if (m?.type === "reaction") {
          textBody = `[reaction] ${m.reaction?.emoji || ""}`.trim();
        } else {
          textBody = `[${m?.type || "unknown"}]`;
        }

        out.push({ from, id, textBody });
      }
    }
  }
  return out;
}

function firstQueryString(q, key) {
  const v = q?.[key];
  if (v == null) return "";
  if (Array.isArray(v)) return String(v[0] ?? "").trim();
  return String(v).trim();
}

/** Resolve verify token from env (production often uses PM2/systemd without a local .env file). */
export function resolveWhatsappWebhookVerifyToken() {
  const raw =
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
    process.env.WHATSAPP_VERIFY_TOKEN ||
    process.env.VERIFY_TOKEN;
  return typeof raw === "string" ? raw.trim() : "";
}

export const verifyWebhook = (req, res) => {
  const mode = firstQueryString(req.query, "hub.mode");
  const incomingToken = firstQueryString(req.query, "hub.verify_token");
  const challenge = firstQueryString(req.query, "hub.challenge");
  const verifyToken = resolveWhatsappWebhookVerifyToken();

  if (mode !== "subscribe") {
    return res.status(403).send("WEBHOOK_INVALID_MODE");
  }
  if (!incomingToken) {
    return res.status(403).send("WEBHOOK_MISSING_HUB_VERIFY_TOKEN");
  }
  if (!verifyToken) {
    return res
      .status(403)
      .send(
        "WEBHOOK_VERIFY_TOKEN_NOT_SET — set WHATSAPP_WEBHOOK_VERIFY_TOKEN (or VERIFY_TOKEN) on the server and restart",
      );
  }
  if (incomingToken !== verifyToken) {
    return res.status(403).send("WEBHOOK_VERIFY_TOKEN_MISMATCH");
  }
  return res.status(200).send(challenge);
};

const appSecret = () =>
  (process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET || "").trim();

/** Meta signs webhook bodies with the app secret (X-Hub-Signature-256). */
function hasValidSignature(req) {
  const secret = appSecret();
  if (!secret) return true; // not configured: accept (logged at startup)
  const header = String(req.headers["x-hub-signature-256"] || "");
  if (!header.startsWith("sha256=") || !req.rawBody) return false;
  const expected = crypto.createHmac("sha256", secret).update(req.rawBody).digest("hex");
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const receiveWebhook = (req, res) => {
  if (!hasValidSignature(req)) {
    console.warn("[webhooks/whatsapp-chat] rejected webhook with invalid signature");
    return res.sendStatus(401);
  }
  // Always respond quickly.
  res.sendStatus(200);

  const incoming = extractIncomingMessages(req.body || {});
  for (const msg of incoming) {
    const phone_e164 = normalizePhoneE164(msg.from);
    if (!phone_e164) continue;

    resolveEnquiryByPhone(phone_e164, (err, enquiry) => {
      if (err) return console.error("resolveEnquiryByPhone:", err);

      logInboundMessage({
        phone_e164,
        wa_message_id: msg.id,
        body: msg.textBody,
        enquirersid: enquiry?.enquirersid || null,
        customer_name: enquiry?.customer_name || null,
      }).catch((e) =>
        console.error("logInboundMessage:", e?.message || e),
      );
    });
  }
};

