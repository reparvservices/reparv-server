/**
 * Import Meta Lead Ads CSV/TSV exports into meta_leads + enquirers
 * (same flow as metalead.controller.js).
 *
 * Usage (from reparv-server/):
 *   npm run import-meta-leads -- --dir src/portals/metalead/scripts/data --dry-run
 *   npm run import-meta-leads -- --file "./scripts/data/IJM....csv"
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { fileURLToPath } from "url";
import csv from "csv-parser";
import db from "#db/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");

// Standard Meta export columns (everything else → enquire_for summary)
const STANDARD_HEADERS = new Set([
  "id",
  "lead_id",
  "leadgen_id",
  "created_time",
  "ad_id",
  "ad_name",
  "adset_id",
  "adset_name",
  "campaign_id",
  "campaign_name",
  "form_id",
  "form_name",
  "is_organic",
  "platform",
  "full_name",
  "phone_number",
  "email",
  "city",
  "property_id",
  "propertyid",
  "enquire_for",
  "reparv_lead",
]);

const COLUMN_ALIASES = {
  lead_id: ["lead_id", "id", "leadgen_id"],
  full_name: ["full_name", "fullname", "name", "customer"],
  phone_number: ["phone_number", "phone", "contact", "mobile"],
  email: ["email", "email_address"],
  city: ["city"],
  property_id: ["property_id", "propertyid"],
  enquire_for: ["enquire_for", "reparv_lead", "location"],
  form_id: ["form_id"],
  form_name: ["form_name"],
  campaign_id: ["campaign_id"],
  campaign_name: ["campaign_name", "campaign"],
  adset_id: ["adset_id"],
  adset_name: ["adset_name"],
  ad_id: ["ad_id"],
  ad_name: ["ad_name"],
  is_organic: ["is_organic", "organic"],
  platform: ["platform"],
  created_time: ["created_time", "created"],
};

const normalizeHeader = (key) =>
  String(key || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

/** Meta CSV uses l:123, ag:456, p:+91... prefixes */
const stripMetaPrefix = (value, prefixes) => {
  if (!value) return null;
  let v = String(value).trim().replace(/^["']|["']$/g, "");
  for (const p of prefixes) {
    if (v.toLowerCase().startsWith(p)) {
      v = v.slice(p.length);
      break;
    }
  }
  return v || null;
};

const normalizeLeadId = (value) =>
  stripMetaPrefix(value, ["l:", "lead:"]);

const normalizePhone = (value) => {
  const v = stripMetaPrefix(value, ["p:", "tel:", "phone:"]);
  return v ? v.replace(/\s+/g, "") : null;
};

const normalizeMetaEntityId = (value, prefix) =>
  stripMetaPrefix(value, [`${prefix}:`]);

const pickValue = (row, field) => {
  const aliases = COLUMN_ALIASES[field] || [field];
  for (const alias of aliases) {
    const key = Object.keys(row).find(
      (k) => normalizeHeader(k) === normalizeHeader(alias),
    );
    if (key && row[key] != null && String(row[key]).trim() !== "") {
      return String(row[key]).trim();
    }
  }
  return null;
};

const buildEnquireFor = (row) => {
  const explicit = pickValue(row, "enquire_for");
  if (explicit) return explicit;

  const parts = [];
  for (const [key, val] of Object.entries(row)) {
    const h = normalizeHeader(key);
    if (STANDARD_HEADERS.has(h)) continue;
    if (val == null || String(val).trim() === "") continue;
    const label = key.replace(/\?$/g, "").replace(/_/g, " ");
    parts.push(`${label}: ${String(val).trim()}`);
  }
  return parts.length ? parts.join(" | ") : null;
};

const parseBool = (value) => {
  if (value == null || value === "") return false;
  const v = String(value).toLowerCase();
  return v === "true" || v === "1" || v === "yes";
};

const parsePropertyId = (value) => {
  if (!value) return null;
  const n = parseInt(String(value).replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
};

const parseCreatedTime = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? null
    : d.toISOString().slice(0, 19).replace("T", " ");
};

const detectEncoding = (filePath) => {
  const buf = fs.readFileSync(filePath);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return "utf16le";
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return "utf16be";
  return "utf8";
};

const readFileText = (filePath) => {
  const encoding = detectEncoding(filePath);
  return fs.readFileSync(filePath, encoding);
};

const detectSeparator = (text) => {
  const sample = text.split(/\r?\n/)[0] || "";
  const tabs = (sample.match(/\t/g) || []).length;
  const commas = (sample.match(/,/g) || []).length;
  return tabs > commas ? "\t" : ",";
};

const rowToLead = (row, index) => {
  const rawLeadId = pickValue(row, "lead_id");
  const leadId = normalizeLeadId(rawLeadId);
  if (!leadId) {
    return { error: `Row ${index + 1}: missing id (got: ${rawLeadId ?? "empty"})` };
  }

  const lead = {
    lead_id: leadId,
    full_name: pickValue(row, "full_name"),
    phone_number: normalizePhone(pickValue(row, "phone_number")),
    email: pickValue(row, "email"),
    city: pickValue(row, "city"),
    property_id: parsePropertyId(pickValue(row, "property_id")),
    enquire_for: buildEnquireFor(row),
    form_id: normalizeMetaEntityId(pickValue(row, "form_id"), "f"),
    campaign_id: normalizeMetaEntityId(pickValue(row, "campaign_id"), "c"),
    campaign_name: pickValue(row, "campaign_name")?.replace(/^["']|["']$/g, ""),
    adset_id: normalizeMetaEntityId(pickValue(row, "adset_id"), "as"),
    adset_name: pickValue(row, "adset_name")?.replace(/^["']|["']$/g, ""),
    ad_id: normalizeMetaEntityId(pickValue(row, "ad_id"), "ag"),
    ad_name: pickValue(row, "ad_name")?.replace(/^["']|["']$/g, ""),
    is_organic: parseBool(pickValue(row, "is_organic")),
    platform: pickValue(row, "platform") || "meta",
    created_time: parseCreatedTime(pickValue(row, "created_time")),
    raw_payload: JSON.stringify({ source: "csv_import", row }),
  };

  return { lead };
};

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
      id = LAST_INSERT_ID(id),
      full_name = VALUES(full_name),
      phone_number = VALUES(phone_number),
      email = VALUES(email),
      city = VALUES(city),
      property_id = VALUES(property_id),
      enquire_for = VALUES(enquire_for),
      form_id = VALUES(form_id),
      campaign_id = VALUES(campaign_id),
      campaign_name = VALUES(campaign_name),
      adset_id = VALUES(adset_id),
      adset_name = VALUES(adset_name),
      ad_id = VALUES(ad_id),
      ad_name = VALUES(ad_name),
      is_organic = VALUES(is_organic),
      platform = VALUES(platform),
      created_time = VALUES(created_time),
      raw_payload = VALUES(raw_payload),
      updated_at = CURRENT_TIMESTAMP
  `;

  const [result] = await db.execute(query, [
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

  return result.insertId;
};

const saveEnquiry = async (lead, metaLeadId) => {
  let projectPartnerId = null;

  if (lead.property_id) {
    const [rows] = await db.execute(
      "SELECT projectpartnerid FROM properties WHERE propertyid = ? LIMIT 1",
      [lead.property_id],
    );
    if (rows.length > 0) {
      projectPartnerId = rows[0].projectpartnerid;
    } else {
      console.warn(`Property not found: ${lead.property_id}`);
    }
  }

  await db.execute(
    `
    INSERT INTO enquirers
    (adsid, propertyid, projectpartnerid, source, customer, contact, location, city, meta_lead_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      projectpartnerid = VALUES(projectpartnerid),
      propertyid = VALUES(propertyid),
      customer = VALUES(customer),
      contact = VALUES(contact),
      location = VALUES(location),
      city = VALUES(city),
      meta_lead_id = VALUES(meta_lead_id),
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
      metaLeadId ?? null,
    ],
  );
};

const cleanRowKeys = (row) => {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[k.replace(/^\uFEFF/, "").trim()] = v;
  }
  return out;
};

const readCsv = (filePath) =>
  new Promise((resolve, reject) => {
    const text = readFileText(filePath);
    const separator = detectSeparator(text);
    const rows = [];
    Readable.from(text)
      .pipe(csv({ separator }))
      .on("data", (row) => rows.push(cleanRowKeys(row)))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });

const listCsvFiles = (dir) =>
  fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".csv"))
    .map((f) => path.join(dir, f))
    .sort();

const parseArgs = () => {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf("--file");
  const dirIdx = args.indexOf("--dir");

  return {
    file: fileIdx >= 0 ? path.resolve(args[fileIdx + 1]) : null,
    dir:
      dirIdx >= 0
        ? path.resolve(args[dirIdx + 1])
        : args.includes("--all")
          ? DATA_DIR
          : null,
    dryRun: args.includes("--dry-run"),
    skipEnquiry: args.includes("--skip-enquiry"),
  };
};

const importFile = async (file, { dryRun, skipEnquiry }) => {
  console.log(`\n── ${path.basename(file)}`);
  const rows = await readCsv(file);
  console.log(`Rows: ${rows.length}`);

  const stats = { ok: 0, failed: 0, skipped: 0 };

  for (let i = 0; i < rows.length; i++) {
    const parsed = rowToLead(rows[i], i);
    if (parsed.error) {
      console.warn(parsed.error);
      stats.skipped++;
      continue;
    }

    const { lead } = parsed;

    if (dryRun) {
      console.log(
        `  [dry-run] ${lead.lead_id} | ${lead.full_name || "-"} | ${lead.phone_number || "-"} | property ${lead.property_id ?? "-"}`,
      );
      stats.ok++;
      continue;
    }

    try {
      const metaLeadId = await saveLead(lead);
      if (!skipEnquiry) {
        await saveEnquiry(lead, metaLeadId);
      }
      console.log(`  Imported: ${lead.lead_id}`);
      stats.ok++;
    } catch (err) {
      console.error(`  Failed ${lead.lead_id}:`, err.message);
      stats.failed++;
    }
  }

  return stats;
};

const mergeStats = (a, b) => ({
  ok: a.ok + b.ok,
  failed: a.failed + b.failed,
  skipped: a.skipped + b.skipped,
});

const main = async () => {
  const { file, dir, dryRun, skipEnquiry } = parseArgs();

  if (!file && !dir) {
    console.error(`
Usage:
  npm run import-meta-leads -- --dir src/portals/metalead/scripts/data [--dry-run]
  npm run import-meta-leads -- --all [--dry-run]
  npm run import-meta-leads -- --file ./path/to/leads.csv [--dry-run] [--skip-enquiry]
`);
    process.exit(1);
  }

  if (dryRun) console.log("DRY RUN — no database writes");

  const opts = { dryRun, skipEnquiry };
  let total = { ok: 0, failed: 0, skipped: 0 };

  if (dir) {
    if (!fs.existsSync(dir)) {
      console.error(`Directory not found: ${dir}`);
      process.exit(1);
    }
    const files = listCsvFiles(dir);
    console.log(`Found ${files.length} CSV file(s) in ${dir}`);
    for (const f of files) {
      const stats = await importFile(f, opts);
      total = mergeStats(total, stats);
    }
  } else {
    if (!fs.existsSync(file)) {
      console.error(`File not found: ${file}`);
      process.exit(1);
    }
    total = await importFile(file, opts);
  }

  console.log("\n══ Total", total);
  process.exit(total.failed > 0 ? 1 : 0);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
