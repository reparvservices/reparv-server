import { processWhatsAppMessage } from "./whatsapp.service.js";

/**
 * Called from Meta webhook after inbound message is logged.
 * Runs asynchronously — must not block webhook 200 response.
 */
export function handleWhatsAppInboundAsync({
  phone_e164,
  textBody,
  wa_message_id,
  enquirersid,
  customer_name,
}) {
  setImmediate(() => {
    processWhatsAppMessage({
      phone_e164,
      textBody,
      wa_message_id,
      enquirersid,
      customer_name,
    }).catch((err) => {
      console.error("[whatsapp/ai]", err?.message || err);
    });
  });
}

/** Synchronous handler for POST /api/ai/whatsapp testing. */
export async function handleWhatsAppInbound(payload) {
  const phone_e164 = payload.phone_e164 || payload.phone;
  return processWhatsAppMessage({
    phone_e164,
    textBody: payload.textBody || payload.message,
    enquirersid: payload.enquirersid,
    customer_name: payload.customer_name,
  });
}
