import axios from "axios";
import crypto from "crypto";
import db from "../../config/db-promise.js";

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
// In handleWebhook – extract form_id from webhook and pass to processLead
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
        const leadgenId = change.value.leadgen_id;
        const formId = change.value.form_id;

        if (!formId) {
          console.warn("No form_id in webhook for lead:", leadgenId);
        }

        await processLead(leadgenId, formId);
      }
    }
  }
};

// Updated processLead – now takes formId as second param (can be null)
const processLead = async (leadId, formId = null) => {
  let leadData = null;

  try {
    // Primary: Fast direct fetch by leadgen_id
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

    console.log("Direct fetch success for lead:", leadId);

    // Format fields
    const formattedFields = {};
    for (const field of data.field_data || []) {
      formattedFields[field.name] =
        Array.isArray(field.values) && field.values.length > 0
          ? field.values[0]
          : null;
    }

    leadData = {
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
  } catch (directError) {
    console.error("Direct fetch failed for lead:", leadId);
    console.error(
      "Error details:",
      directError.response?.data || directError.message,
    );

    // Fallback only if we have form_id from webhook
    if (formId) {
      try {
        console.log(`Fallback: Trying /${formId}/leads for lead ${leadId}`);

        const fallbackRes = await axios.get(
          `https://graph.facebook.com/v24.0/${formId}/leads`,
          {
            params: {
              fields: "created_time,id,ad_id,form_id,field_data",
              access_token: PAGE_ACCESS_TOKEN,
              limit: 10, // small page – we expect recent/new leads
              // Optional: time_since or filter if you want tighter, but usually recent leads are first
            },
          },
        );

        // Find our specific lead in the recent list
        const matchingLead = fallbackRes.data.data?.find(
          (l) => l.id === leadId,
        );

        if (matchingLead) {
          console.log("Fallback success – found lead via form");

          const formattedFields = {};
          for (const field of matchingLead.field_data || []) {
            formattedFields[field.name] =
              Array.isArray(field.values) && field.values.length > 0
                ? field.values[0]
                : null;
          }

          leadData = {
            lead_id: matchingLead.id,
            full_name: formattedFields.full_name || null,
            phone_number: formattedFields.phone_number || null,
            email: formattedFields.email || null,
            city: formattedFields.city || null,
            property_id: formattedFields.property_id
              ? parseInt(formattedFields.property_id)
              : null,
            enquire_for: formattedFields.reparv_lead || null,
            form_id: matchingLead.form_id || formId,
            // Note: fallback may miss ad/campaign details – set to null or fetch separately if critical
            campaign_id: null,
            campaign_name: null,
            adset_id: null,
            adset_name: null,
            ad_id: null,
            ad_name: null,
            is_organic: null,
            platform: null,
            created_time: matchingLead.created_time,
            raw_payload: JSON.stringify(matchingLead),
          };
        } else {
          console.warn(`Lead ${leadId} not found in recent form leads`);
        }
      } catch (fallbackErr) {
        console.error(
          "Fallback failed too:",
          fallbackErr.response?.data || fallbackErr.message,
        );
      }
    } else {
      console.warn("No form_id available for fallback – skipping");
    }
  }

  // Only save if we have data (direct or fallback)
  if (leadData) {
    await saveEnquiry(leadData);
    await saveLead(leadData);
  } else {
    console.warn(
      `No data fetched for lead ${leadId} – check permissions or lead type`,
    );
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
  try {
    let projectPartnerId = null;

    // 1️⃣ Fetch projectpartnerid
    if (lead.property_id) {
      const [rows] = await db.execute(
        "SELECT projectpartnerid FROM properties WHERE propertyid = ? LIMIT 1",
        [lead.property_id],
      );

      if (rows.length > 0) {
        projectPartnerId = rows[0].projectpartnerid;
        console.log("Found projectPartnerId:", projectPartnerId);
      } else {
        console.warn("Property not found:", lead.property_id);
      }
    }

    // 2️⃣ Insert into enquirers
    await db.execute(
      `
      INSERT INTO enquirers
      (adsid, propertyid, projectpartnerid, source, customer, contact, location, city)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        projectpartnerid = VALUES(projectpartnerid),
        updated_at = CURRENT_TIMESTAMP
      `,
      [
        lead.lead_id ?? null,
        lead.property_id ?? null,
        projectPartnerId ?? null,
        lead.platform || "meta",
        lead.full_name ?? null,
        lead.phone_number ?? null,
        lead.enquire_for ?? null,
        lead.city ?? null,
      ],
    );

    console.log("Enquiry saved successfully");
  } catch (error) {
    console.error("SAVE ENQUIRY ERROR:", error.message);
    throw error;
  }
};
