// backfill-missed-leads.js
// Run with: node backfill-missed-leads.js

import "dotenv/config";
import axios from "axios";

// Adjust path to your promise-based DB connection
import db from "../../config/db-promise.js";
// ────────────────────────────────────────────────
// Your saveEnquiry function (paste your exact version here)
const saveEnquiry = async (lead) => {
  try {
    let projectPartnerId = null;

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

    console.log(`Enquiry saved: ${lead.lead_id}`);
  } catch (error) {
    console.error("SAVE ENQUIRY ERROR:", error.message);
  }
};

// ────────────────────────────────────────────────
// Your saveLead function (paste your exact version here)
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

  console.log(`Meta lead saved: ${lead.lead_id}`);
};

// ────────────────────────────────────────────────
// Your processLead function (paste your latest version)
// This one uses the direct fetch — add fallback if you want
// ────────────────────────────────────────────────

const { PAGE_ACCESS_TOKEN } = process.env;

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
        ? parseInt(formattedFields.property_id, 10)
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

    console.log(`Processed lead successfully: ${leadId}`);
  } catch (error) {
    console.error(
      `Failed to process lead ${leadId}:`,
      error.response?.data?.error || error.message,
    );
  }
};

// ────────────────────────────────────────────────
// Backfill function – paginates through all leads on a form
// ────────────────────────────────────────────────

const backfillForm = async (formId, sinceDate = null) => {
  let url =
    `https://graph.facebook.com/v24.0/${formId}/leads?` +
    `access_token=${PAGE_ACCESS_TOKEN}&` +
    `fields=created_time,id&` +
    `limit=50`;

  if (sinceDate) {
    const until = new Date().toISOString().split("T")[0];
    url += `&time_range={"since":"${sinceDate}","until":"${until}"}`;
  }

  let page = 0;
  let total = 0;

  while (url) {
    page++;
    console.log(`\nFetching page ${page} for form ${formId}...`);

    try {
      const {
        data: { data: leads = [], paging },
      } = await axios.get(url);

      if (leads.length === 0) {
        console.log("No more leads found.");
        break;
      }

      console.log(`Found ${leads.length} leads on this page`);

      for (const lead of leads) {
        total++;
        console.log(
          `→ Lead ${total}: ${lead.id} (${lead.created_time || "no date"})`,
        );

        await processLead(lead.id);
      }

      url = paging?.next ?? null;

      // Rate limit safety (adjust if needed)
      if (url) await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (err) {
      console.error(
        `Error on page ${page}:`,
        err.response?.data?.error || err.message,
      );
      break;
    }
  }

  console.log(`\nFinished form ${formId} — total leads attempted: ${total}`);
};

// ────────────────────────────────────────────────
// Main execution
// ────────────────────────────────────────────────

(async () => {
  const formIds = ["1232344812410476"];

  // Optional: only leads since this date
  const sinceDate = null;
  for (const formId of formIds) {
    await backfillForm(formId, sinceDate);
  }

  console.log("\nBackfill completed. Check your database.");
  process.exit(0);
})();
