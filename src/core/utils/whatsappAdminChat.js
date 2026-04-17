import axios from "axios";
import moment from "moment-timezone";
import db from "#db";

const API_VERSION = process.env.WHATSAPP_API_VERSION || "v21.0";
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

function graphUrl(path) {
  return `https://graph.facebook.com/${API_VERSION}/${path}`;
}

/**
 * Normalize mobile to WhatsApp Cloud API 'to' digits form (no '+' prefix).
 * Example: 8010881965 -> 918010881965
 */
export function normalizePhoneE164(contact) {
  if (contact == null || contact === "") return null;
  let d = String(contact).replace(/\D/g, "");

  // If 10 digits and Indian mobile => add country code
  if (d.length === 10 && /^[6-9]/.test(d)) d = `91${d}`;

  if (d.length < 10 || d.length > 15) return null;
  return d;
}

function normalizePhoneLast10Digits(contactE164) {
  if (!contactE164) return null;
  const d = String(contactE164).replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : null;
}

async function postMessages(payload) {
  if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
    throw new Error(
      "WhatsApp Cloud API not configured: set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN",
    );
  }

  const url = graphUrl(`${PHONE_NUMBER_ID}/messages`);
  const { data } = await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    timeout: 30000,
  });
  return data;
}

export async function sendTextMessage({ toDigits, body }) {
  const to = normalizePhoneE164(toDigits);
  if (!to) throw new Error("Invalid phone for WhatsApp");

  const text = String(body || "").trim();
  if (!text) throw new Error("Message body is required");

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: false, body: text.slice(0, 4096) },
  };

  return postMessages(payload);
}

export function logInboundMessage({
  phone_e164,
  wa_message_id,
  body,
  enquirersid,
  customer_name,
}) {
  const created_at = moment().format("YYYY-MM-DD HH:mm:ss");
  return new Promise((resolve, reject) => {
    db.query(
      `INSERT INTO whatsapp_admin_chat
        (phone_e164, direction, body, wa_message_id, enquirersid, customer_name, created_at)
       VALUES (?, 'inbound', ?, ?, ?, ?, ?)`,
      [
        phone_e164,
        body,
        wa_message_id || null,
        enquirersid || null,
        customer_name || null,
        created_at,
      ],
      (err, result) => {
        if (err) {
          // If duplicate wa_message_id or table missing, don't crash webhook.
          if (err.code === "ER_DUP_ENTRY") return resolve(null);
          if (err.code === "ER_NO_SUCH_TABLE") {
            console.warn(
              "whatsapp_admin_chat table missing; run migrations/whatsapp_admin_chat.sql",
            );
            return resolve(null);
          }
          return reject(err);
        }
        resolve(result);
      },
    );
  });
}

export function logOutboundMessage({
  phone_e164,
  wa_message_id,
  body,
  enquirersid,
  customer_name,
}) {
  const created_at = moment().format("YYYY-MM-DD HH:mm:ss");
  return new Promise((resolve, reject) => {
    db.query(
      `INSERT INTO whatsapp_admin_chat
        (phone_e164, direction, body, wa_message_id, enquirersid, customer_name, created_at)
       VALUES (?, 'outbound', ?, ?, ?, ?, ?)`,
      [
        phone_e164,
        body,
        wa_message_id || null,
        enquirersid || null,
        customer_name || null,
        created_at,
      ],
      (err, result) => {
        if (err) {
          if (err.code === "ER_DUP_ENTRY") return resolve(null);
          if (err.code === "ER_NO_SUCH_TABLE") {
            console.warn(
              "whatsapp_admin_chat table missing; run migrations/whatsapp_admin_chat.sql",
            );
            return resolve(null);
          }
          return reject(err);
        }
        resolve(result);
      },
    );
  });
}

export function resolveEnquiryByPhone(phone_e164, callback) {
  // Most likely your `enquirers.contact` is stored as 10 digits.
  // We'll try both full e164 and last10.
  const last10 = normalizePhoneLast10Digits(phone_e164);

  const candidates = [phone_e164].filter(Boolean);
  if (last10) candidates.push(last10);

  db.query(
    `SELECT enquirersid, customer
     FROM enquirers
     WHERE contact IN (?)
     ORDER BY updated_at DESC, created_at DESC
     LIMIT 1`,
    [candidates],
    (err, rows) => {
      if (err) return callback(err, null);
      if (!rows?.length) return callback(null, null);
      callback(null, { enquirersid: rows[0].enquirersid, customer_name: rows[0].customer });
    },
  );
}

