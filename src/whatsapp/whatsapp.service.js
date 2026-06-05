import {
  sendTextMessage,
  logOutboundMessage,
  normalizePhoneE164,
  resolveEnquiryByPhone,
} from "#utils/whatsappAdminChat.js";
import { runAgent } from "../ai/agent.service.js";

function isWhatsAppAiEnabled() {
  return process.env.AI_WHATSAPP_ENABLED !== "0";
}

/**
 * Process inbound WhatsApp text and reply via Cloud API.
 */
export async function processWhatsAppMessage({
  phone_e164,
  textBody,
  wa_message_id,
  enquirersid,
  customer_name,
}) {
  if (!isWhatsAppAiEnabled()) {
    return { skipped: true, reason: "AI_WHATSAPP_ENABLED=0" };
  }

  const body = String(textBody || "").trim();
  if (!body || body.startsWith("[") && body.endsWith("]")) {
    return { skipped: true, reason: "non-text message" };
  }

  const userId = `wa:${phone_e164}`;
  const agentResult = await runAgent({
    userId,
    message: body,
    channel: "whatsapp",
    phone: phone_e164,
  });

  const reply = agentResult.reply?.slice(0, 4096);
  if (!reply) return { sent: false };

  const sendResult = await sendTextMessage({
    toDigits: phone_e164,
    body: reply,
  });

  const outboundId =
    sendResult?.messages?.[0]?.id || sendResult?.message_id || null;

  await logOutboundMessage({
    phone_e164,
    wa_message_id: outboundId,
    body: reply,
    enquirersid: enquirersid || null,
    customer_name: customer_name || null,
  });

  return {
    sent: true,
    reply,
    waMessageId: outboundId,
    toolCalls: agentResult.toolCalls,
  };
}

export function resolveEnquiryForPhone(phone_e164) {
  return new Promise((resolve, reject) => {
    resolveEnquiryByPhone(phone_e164, (err, enquiry) => {
      if (err) reject(err);
      else resolve(enquiry);
    });
  });
}

export { normalizePhoneE164 };
