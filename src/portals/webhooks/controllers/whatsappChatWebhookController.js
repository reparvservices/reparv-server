import {
  logInboundMessage,
  resolveEnquiryByPhone,
  normalizePhoneE164,
} from "#utils/whatsappAdminChat.js";
import { handleWhatsAppInboundAsync } from "../../../whatsapp/webhook.controller.js";

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

        if (m?.type === "text" && m?.text?.body) {
          textBody = m.text.body;
        } else if (m?.type === "interactive") {
          // Keep it readable in admin chat.
          textBody = "[interactive message]";
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

export const receiveWebhook = (req, res) => {
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

      if (msg.textBody && !msg.textBody.startsWith("[")) {
        handleWhatsAppInboundAsync({
          phone_e164,
          textBody: msg.textBody,
          wa_message_id: msg.id,
          enquirersid: enquiry?.enquirersid || null,
          customer_name: enquiry?.customer_name || null,
        });
      }
    });
  }
};

