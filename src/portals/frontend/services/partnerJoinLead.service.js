import crypto from "crypto";
import dbPromise from "#db/promise";
import otpStore from "#utils/otpStore.js";
import { sendPartnerAppLinkTemplate } from "#utils/whatsappAdminChat.js";

const DEFAULT_PLAY_STORE =
  "https://play.google.com/store/apps/details?id=com.reparvprojectpartner";
const DEFAULT_APP_STORE =
  "https://play.google.com/store/apps/details?id=com.reparvprojectpartner";

export function getPartnerAppUrls() {
  return {
    playStore: process.env.PARTNER_PLAY_STORE_URL || DEFAULT_PLAY_STORE,
    appStore: process.env.PARTNER_APP_STORE_URL || DEFAULT_APP_STORE,
  };
}

export function normalizeContact(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  if (d.length === 10 && /^[6-9]/.test(d)) return d;
  if (d.length === 12 && d.startsWith("91")) return d.slice(2);
  return null;
}

export function verifyOtpFromStore(phone, otp) {
  const record = otpStore.get(phone);
  if (!record) return { ok: false, message: "OTP expired or invalid" };
  if (Date.now() > record.expiresAt) {
    otpStore.delete(phone);
    return { ok: false, message: "OTP expired" };
  }
  if (String(record.otp) !== String(otp)) {
    return { ok: false, message: "Invalid OTP" };
  }
  otpStore.delete(phone);
  return { ok: true };
}

function createJoinToken() {
  return crypto.randomBytes(16).toString("hex");
}

export async function partnerContactAlreadyRegistered(contact) {
  const [rows] = await dbPromise.query(
    "SELECT id FROM projectpartner WHERE contact = ? LIMIT 1",
    [contact],
  );
  return rows.length > 0;
}

export async function validateContactForPartnerJoin(contact) {
  if (await partnerContactAlreadyRegistered(contact)) {
    return {
      ok: false,
      status: 409,
      message:
        "This WhatsApp number is already registered as a Reparv Partner. Please sign in to the app.",
    };
  }

  try {
    const [leadRows] = await dbPromise.query(
      "SELECT status FROM partner_join_leads WHERE contact = ? LIMIT 1",
      [contact],
    );
    if (leadRows[0]?.status === "registered") {
      return {
        ok: false,
        status: 409,
        message:
          "This number has already completed partner registration. Please sign in to the app.",
      };
    }
  } catch (err) {
    if (err?.code !== "ER_NO_SUCH_TABLE") throw err;
  }

  return { ok: true };
}

export async function upsertPartnerJoinLead({ firstName, lastName, contact, now }) {
  const joinToken = createJoinToken();
  const sql = `
    INSERT INTO partner_join_leads
      (first_name, last_name, contact, join_token, status, source, otp_verified_at, updated_at)
    VALUES (?, ?, ?, ?, 'verified', 'website_join_modal', ?, ?)
    ON DUPLICATE KEY UPDATE
      first_name = VALUES(first_name),
      last_name = VALUES(last_name),
      join_token = VALUES(join_token),
      status = 'verified',
      otp_verified_at = VALUES(otp_verified_at),
      whatsapp_sent_at = NULL,
      registered_at = NULL,
      updated_at = VALUES(updated_at)
  `;
  await dbPromise.query(sql, [
    firstName,
    lastName,
    contact,
    joinToken,
    now,
    now,
  ]);

  const [rows] = await dbPromise.query(
    "SELECT * FROM partner_join_leads WHERE contact = ? LIMIT 1",
    [contact],
  );
  return rows[0];
}

export async function markWhatsAppSent(contact, now) {
  await dbPromise.query(
    `UPDATE partner_join_leads
     SET status = 'whatsapp_sent', whatsapp_sent_at = ?, updated_at = ?
     WHERE contact = ?`,
    [now, now, contact],
  );
}

export async function markPartnerJoinLeadRegistered(contact) {
  const now = new Date();
  const formatted = now.toISOString().slice(0, 19).replace("T", " ");
  await dbPromise.query(
    `UPDATE partner_join_leads
     SET status = 'registered', registered_at = ?, updated_at = ?
     WHERE contact = ? AND status != 'registered'`,
    [formatted, formatted, String(contact)],
  );
}

export async function getPartnerJoinLeadByToken(token) {
  const [rows] = await dbPromise.query(
    `SELECT first_name, last_name, contact, status, join_token
     FROM partner_join_leads
     WHERE join_token = ?
     LIMIT 1`,
    [token],
  );
  if (!rows.length) return null;
  const row = rows[0];
  if (row.status === "registered") {
    return { error: "already_registered" };
  }
  return {
    firstName: row.first_name,
    lastName: row.last_name,
    contact: row.contact,
    fullname: `${row.first_name} ${row.last_name}`.trim(),
    status: row.status,
    joinToken: row.join_token,
  };
}

export async function sendPartnerJoinWhatsApp({ contact, firstName }) {
  return sendPartnerAppLinkTemplate({ toDigits: contact, firstName });
}

export async function listPartnerJoinLeads({ search, status, page = 1, limit = 25 } = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 25));
  const offset = (safePage - 1) * safeLimit;

  const conditions = [];
  const params = [];

  if (status && status !== "all") {
    conditions.push("status = ?");
    params.push(status);
  }

  if (search) {
    conditions.push(
      `(first_name LIKE ? OR last_name LIKE ? OR contact LIKE ? OR CONCAT(first_name, ' ', last_name) LIKE ?)`,
    );
    const q = `%${search}%`;
    params.push(q, q, q, q);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [countRows] = await dbPromise.query(
    `SELECT COUNT(*) AS total FROM partner_join_leads ${where}`,
    params,
  );

  const [rows] = await dbPromise.query(
    `SELECT id, first_name, last_name, contact, join_token, status, source,
            otp_verified_at, whatsapp_sent_at, registered_at, created_at, updated_at
     FROM partner_join_leads
     ${where}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, safeLimit, offset],
  );

  return {
    rows,
    total: countRows[0]?.total ?? 0,
    page: safePage,
    limit: safeLimit,
  };
}
