import axios from "axios";
import crypto from "crypto";
import db from "../../config/dbconnect.js";

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const APP_SECRET = process.env.APP_SECRET;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

/* =========================
   Signature Verification
========================= */
const verifySignature = (req) => {
  const signature = req.headers["x-hub-signature-256"];
  if (!signature) return false;

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", APP_SECRET).update(req.rawBody).digest("hex");

  return signature === expected;
};

/* =========================
   Webhook Verification
========================= */
export const verifyWebhook = (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
};

/* =========================
   Webhook Listener
========================= */
export const handleWebhook = async (req, res) => {
  if (!verifySignature(req)) {
    return res.sendStatus(403);
  }

  res.status(200).send("EVENT_RECEIVED");

  const body = req.body;
  if (body.object !== "page") return;

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field === "leadgen" && change.value?.leadgen_id) {
        await processLead(change.value.leadgen_id);
      }
    }
  }
};

/* =========================
   Fetch Lead & Save
========================= */
const processLead = async (leadId) => {
  try {
    const { data } = await axios.get(
      `https://graph.facebook.com/v24.0/${leadId}`,
      {
        params: {
          fields:
            "created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,is_organic,platform,field_data",
          access_token: PAGE_ACCESS_TOKEN,
        },
      },
    );

    const formattedFields = {};

    for (const field of data.field_data || []) {
      formattedFields[field.name] =
        Array.isArray(field.values) && field.values.length > 0
          ? field.values[0]
          : null;
    }

    const leadData = {
      lead_id: data.id,
      full_name: formattedFields.full_name || null,
      phone_number: formattedFields.phone_number || null,
      email: formattedFields.email || null,
      city: formattedFields.city || null,

      property_id: formattedFields.property_id
        ? parseInt(formattedFields.property_id)
        : null,

      enquire_for: formattedFields.reparv_lead || null,

      form_id: data.form_id || null,
      campaign_id: data.campaign_id || null,
      campaign_name: data.campaign_name || null,
      adset_id: data.adset_id || null,
      adset_name: data.adset_name || null,
      ad_id: data.ad_id || null,
      ad_name: data.ad_name || null,

      is_organic: data.is_organic || false,
      platform: data.platform || null,
      created_time: data.created_time,
      raw_payload: JSON.stringify(data),
    };

    await saveEnquiry(leadData);
    await saveLead(leadData);
  } catch (error) {
    console.error("Meta Lead Error:", error.response?.data || error.message);
  }
};

/* =========================
   Save To MySQL
========================= */
const saveLead = async (lead) => {
  const query = `
    INSERT INTO meta_leads
      (lead_id, full_name, phone_number, email, city,
       property_id, enquire_for,
      form_id, campaign_id, campaign_name,
      adset_id, adset_name, ad_id, ad_name,
      is_organic, platform, created_time, raw_payload)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      full_name = VALUES(full_name),
      phone_number = VALUES(phone_number),
      email = VALUES(email),
      updated_at = CURRENT_TIMESTAMP
  `;

  await db.execute(query, [
    lead.lead_id ?? null,
    lead.full_name ?? null,
    lead.phone_number ?? null,
    lead.email ?? null,
    lead.city ?? null,
    lead.property_id ?? null,
    lead.enquire_for ?? null,
    lead.form_id ?? null,
    lead.campaign_id ?? null,
    lead.campaign_name ?? null,
    lead.adset_id ?? null,
    lead.adset_name ?? null,
    lead.ad_id ?? null,
    lead.ad_name ?? null,
    lead.is_organic ?? false,
    lead.platform ?? null,
    lead.created_time ?? null,
    lead.raw_payload ?? null,
  ]);
};

const saveEnquiry = async (lead) => {
  let projectPartnerId = null;

  // 1️⃣ Fetch projectpartnerid using propertyid
  if (lead.property_id) {
    const [rows] = await db.execute(
      "SELECT projectpartnerid FROM properties WHERE propertyid = ?",
      [lead.property_id],
    );

    if (rows.length > 0) {
      projectPartnerId = rows[0].projectpartnerid;
    }
  }

  // 2️⃣ Insert into enquirers
  const query = `
    INSERT INTO enquirers
    (adsid, propertyid, projectpartnerid, source, customer, contact, location, city)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      updated_at = CURRENT_TIMESTAMP
  `;

  await db.execute(query, [
    lead.lead_id ?? null,
    lead.property_id ?? null,
    projectPartnerId ?? null,
    lead.platform ?? "meta",
    lead.full_name ?? null,
    lead.phone_number ?? null,
    lead.enquire_for ?? null,
    lead.city ?? null,
  ]);
};
