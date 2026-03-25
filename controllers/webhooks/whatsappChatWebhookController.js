import {
  logInboundMessage,
  resolveEnquiryByPhone,
  normalizePhoneE164,
} from "../../utils/whatsappAdminChat.js";

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

export const verifyWebhook = (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && token && verifyToken && token === verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
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
    });
  }
};

