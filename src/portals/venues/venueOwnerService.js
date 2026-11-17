/**
 * Partner (owner) and admin side of venue listings: create / edit / submit, block dates,
 * see bookings, approve or reject. Identity always comes from the login, never the body.
 */
import dbPromise from "#db/promise";
import { httpError } from "./venueService.js";
import { isValidDate, addDays } from "./venuePricing.js";

const rows = async (sql, params = []) => (await dbPromise.query(sql, params))[0];

const TYPES = ["villa", "hall", "banquet", "farmhouse", "resort", "lawn", "other"];
const MODELS = ["night", "slot"];
const POLICIES = ["flexible", "moderate", "strict"];

const int = (v, min, max, label) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw httpError(400, `${label} must be a whole number between ${min} and ${max}.`);
  return n;
};
const text = (v, max) => (v == null ? null : String(v).trim().slice(0, max) || null);
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);


/** Allowed social/web links: key -> hosts it may point to (null = any https site). */
export const SOCIAL_HOSTS = {
  youtube: ["youtube.com", "youtu.be"],
  instagram: ["instagram.com"],
  facebook: ["facebook.com", "fb.com", "fb.watch"],
  x: ["x.com", "twitter.com"],
  linkedin: ["linkedin.com"],
  website: null,
};

const hostMatches = (host, allowed) => allowed.some((h) => host === h || host.endsWith("." + h));

/** An https URL (or throws). Optional host allowlist. */
function cleanUrl(value, label, hosts = null) {
  let u;
  try {
    u = new URL(String(value).trim());
  } catch {
    throw httpError(400, `${label} must be a valid link.`);
  }
  if (u.protocol !== "https:") throw httpError(400, `${label} must start with https://`);
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (hosts && !hostMatches(host, hosts)) throw httpError(400, `${label} must be a ${hosts[0]} link.`);
  return u.toString().slice(0, 500);
}

export function cleanSocialLinks(input) {
  const out = {};
  for (const [key, hosts] of Object.entries(SOCIAL_HOSTS)) {
    const v = input?.[key];
    if (v === undefined || v === null || String(v).trim() === "") continue;
    out[key] = cleanUrl(v, key[0].toUpperCase() + key.slice(1) + " link", hosts);
  }
  return out;
}

/** Validate a partner-supplied listing. `partial` = update (only validate the fields present). */
export function validateListing(body, partial = false) {
  const out = {};
  const has = (k) => body[k] !== undefined;
  const need = (k) => { if (!partial && !has(k)) throw httpError(400, `${k} is required.`); return has(k); };

  if (need("title")) { out.title = text(body.title, 200); if (!out.title) throw httpError(400, "title is required."); }
  if (need("type")) { if (!TYPES.includes(body.type)) throw httpError(400, `type must be one of ${TYPES.join(", ")}.`); out.type = body.type; }
  if (has("type") || has("custom_type")) {
    const isOther = (body.type ?? out.type) === "other";
    if (isOther) {
      const name = text(body.custom_type, 60);
      if (!name || name.length < 2) throw httpError(400, "Please enter the type of venue (for example 'Rooftop party space').");
      out.custom_type = name;
    } else if (has("type")) {
      out.custom_type = null;
    }
  }
  if (need("price_model")) { if (!MODELS.includes(body.price_model)) throw httpError(400, "price_model must be night or slot."); out.price_model = body.price_model; }
  if (need("base_price")) out.base_price = int(body.base_price, 100, 10_000_000, "base_price");
  if (need("capacity")) out.capacity = int(body.capacity, 1, 5000, "capacity");
  if (need("city")) { out.city = text(body.city, 100); if (!out.city) throw httpError(400, "city is required."); }

  if (has("weekend_price")) out.weekend_price = body.weekend_price === null || body.weekend_price === "" ? null : int(body.weekend_price, 100, 10_000_000, "weekend_price");
  if (has("cleaning_fee")) out.cleaning_fee = int(body.cleaning_fee || 0, 0, 1_000_000, "cleaning_fee");
  if (has("deposit_percent")) out.deposit_percent = int(body.deposit_percent, 10, 100, "deposit_percent");
  if (has("min_nights")) out.min_nights = int(body.min_nights, 1, 30, "min_nights");
  if (has("max_nights")) out.max_nights = int(body.max_nights, 1, 90, "max_nights");
  if (has("bedrooms")) out.bedrooms = body.bedrooms === null || body.bedrooms === "" ? null : int(body.bedrooms, 0, 100, "bedrooms");
  if (has("cancellation_policy")) { if (!POLICIES.includes(body.cancellation_policy)) throw httpError(400, "cancellation_policy must be flexible, moderate or strict."); out.cancellation_policy = body.cancellation_policy; }
  if (has("description")) out.description = text(body.description, 5000);
  if (has("state")) out.state = text(body.state, 100);
  if (has("address")) out.address = text(body.address, 500);
  if (has("rules")) out.rules = text(body.rules, 2000);
  if (has("latitude")) out.latitude = body.latitude === null || body.latitude === "" ? null : Math.max(-90, Math.min(90, Number(body.latitude)));
  if (has("longitude")) out.longitude = body.longitude === null || body.longitude === "" ? null : Math.max(-180, Math.min(180, Number(body.longitude)));
  if (has("amenities")) out.amenities = JSON.stringify((Array.isArray(body.amenities) ? body.amenities : []).map((a) => String(a).slice(0, 60)).slice(0, 40));
  if (has("images")) out.images = JSON.stringify((Array.isArray(body.images) ? body.images : []).map((a) => String(a).slice(0, 500)).filter((u) => /^https?:\/\/|^\//.test(u)).slice(0, 20));
  if (has("videos")) {
    const list = Array.isArray(body.videos) ? body.videos : [];
    out.videos = JSON.stringify(list.slice(0, 3).map((v, i) => cleanUrl(v, `Video ${i + 1}`)));
  }
  if (has("social_links")) out.social_links = JSON.stringify(cleanSocialLinks(body.social_links));
  if ((out.min_nights ?? 1) > (out.max_nights ?? 90)) throw httpError(400, "min_nights cannot exceed max_nights.");
  return out;
}

export async function createListing(owner, body) {
  const f = validateListing(body);
  f.slug = slugify(f.title);
  const cols = Object.keys(f);
  const [res] = await dbPromise.query(
    `INSERT INTO venue_listings (owner_role, owner_id, status, ${cols.join(",")}) VALUES (?, ?, 'draft', ${cols.map(() => "?").join(",")})`,
    [owner.role, owner.id, ...cols.map((c) => f[c])],
  );
  return getOwnListing(owner, res.insertId);
}

async function ownListingRow(owner, id) {
  const [l] = await rows(`SELECT * FROM venue_listings WHERE id = ? AND owner_role = ? AND owner_id = ?`, [id, owner.role, owner.id]);
  if (!l) throw httpError(404, "Listing not found.");
  return l;
}
export const getOwnListing = (owner, id) => ownListingRow(owner, id);
export const listOwnListings = (owner) => rows(`SELECT * FROM venue_listings WHERE owner_role = ? AND owner_id = ? ORDER BY id DESC`, [owner.role, owner.id]);

export async function updateListing(owner, id, body) {
  const existing = await ownListingRow(owner, id);
  const f = validateListing(body, true);
  const cols = Object.keys(f);
  if (!cols.length) return existing;
  // changing a rejected listing sends it back to draft so it can be re-submitted
  const status = existing.status === "rejected" ? ", status = 'draft', reject_reason = NULL" : "";
  await rows(`UPDATE venue_listings SET ${cols.map((c) => `${c} = ?`).join(", ")}${status} WHERE id = ?`, [...cols.map((c) => f[c]), id]);
  return ownListingRow(owner, id);
}

export async function setListingStatus(owner, id, action) {
  const l = await ownListingRow(owner, id);
  if (action === "submit") {
    if (!["draft", "rejected"].includes(l.status)) throw httpError(409, `A ${l.status} listing cannot be submitted.`);
    const imgs = typeof l.images === "string" ? JSON.parse(l.images || "[]") : l.images || [];
    if (!imgs.length) throw httpError(400, "Add at least one photo before submitting.");
    await rows(`UPDATE venue_listings SET status = 'pending', reject_reason = NULL WHERE id = ?`, [id]);
  } else if (action === "pause") {
    if (l.status !== "live") throw httpError(409, "Only live listings can be paused.");
    await rows(`UPDATE venue_listings SET status = 'paused' WHERE id = ?`, [id]);
  } else if (action === "resume") {
    if (l.status !== "paused") throw httpError(409, "Only paused listings can be resumed.");
    await rows(`UPDATE venue_listings SET status = 'live' WHERE id = ?`, [id]);
  } else throw httpError(400, "Unknown action.");
  return ownListingRow(owner, id);
}

export async function blockDates(owner, id, { from, to, slot = "full", reason }) {
  await ownListingRow(owner, id);
  if (!isValidDate(from) || !isValidDate(to) || from > to) throw httpError(400, "from/to must be valid dates (YYYY-MM-DD), from <= to.");
  if (!["full", "morning", "evening"].includes(slot)) throw httpError(400, "Invalid slot.");
  const dates = [];
  for (let d = from; d <= to && dates.length < 366; d = addDays(d, 1)) dates.push(d);
  await dbPromise.query(
    `INSERT IGNORE INTO venue_blocked_dates (listing_id, block_date, slot, reason) VALUES ${dates.map(() => "(?,?,?,?)").join(",")}`,
    dates.flatMap((d) => [id, d, slot, text(reason, 200)]),
  );
  return { blocked: dates.length };
}

export async function unblockDates(owner, id, { from, to }) {
  await ownListingRow(owner, id);
  if (!isValidDate(from) || !isValidDate(to) || from > to) throw httpError(400, "from/to must be valid dates (YYYY-MM-DD), from <= to.");
  const [res] = await dbPromise.query(`DELETE FROM venue_blocked_dates WHERE listing_id = ? AND block_date BETWEEN ? AND ?`, [id, from, to]);
  return { unblocked: res.affectedRows };
}

export const listOwnerBookings = (owner) =>
  rows(
    `SELECT b.id, b.booking_ref, b.listing_id, l.title AS listing_title,
            DATE_FORMAT(b.start_date,'%Y-%m-%d') AS start_date, DATE_FORMAT(b.end_date,'%Y-%m-%d') AS end_date,
            b.slot, b.guests, b.total_amount, b.amount_paid, b.status, b.guest_name, b.guest_phone, b.created_at
     FROM venue_bookings b JOIN venue_listings l ON l.id = b.listing_id
     WHERE l.owner_role = ? AND l.owner_id = ? AND b.status IN ('confirmed','completed','cancelled')
     ORDER BY b.id DESC LIMIT 200`,
    [owner.role, owner.id],
  );

// ───────────────────────────── admin ─────────────────────────────

export const adminListListings = (status) =>
  rows(`SELECT * FROM venue_listings ${status ? "WHERE status = ?" : ""} ORDER BY id DESC LIMIT 300`, status ? [status] : []);

export async function adminDecide(id, { action, reason, commission_percent }) {
  const [l] = await rows(`SELECT id, status FROM venue_listings WHERE id = ?`, [id]);
  if (!l) throw httpError(404, "Listing not found.");
  if (action === "approve") {
    if (l.status !== "pending") throw httpError(409, "Only pending listings can be approved.");
    const c = commission_percent === undefined ? null : Number(commission_percent);
    if (c !== null && (!Number.isFinite(c) || c < 0 || c > 50)) throw httpError(400, "commission_percent must be 0-50.");
    await rows(`UPDATE venue_listings SET status = 'live'${c === null ? "" : ", commission_percent = ?"} WHERE id = ?`, c === null ? [id] : [c, id]);
  } else if (action === "reject") {
    if (!["pending", "live", "paused"].includes(l.status)) throw httpError(409, "This listing cannot be rejected.");
    const why = text(reason, 500);
    if (!why) throw httpError(400, "A reason is required.");
    await rows(`UPDATE venue_listings SET status = 'rejected', reject_reason = ? WHERE id = ?`, [why, id]);
  } else throw httpError(400, "action must be approve or reject.");
  return (await rows(`SELECT * FROM venue_listings WHERE id = ?`, [id]))[0];
}

export const adminListBookings = () =>
  rows(
    `SELECT b.id, b.booking_ref, b.listing_id, l.title AS listing_title, b.customer_id,
            DATE_FORMAT(b.start_date,'%Y-%m-%d') AS start_date, DATE_FORMAT(b.end_date,'%Y-%m-%d') AS end_date,
            b.slot, b.guests, b.total_amount, b.amount_paid, b.refund_amount, b.status, b.created_at
     FROM venue_bookings b JOIN venue_listings l ON l.id = b.listing_id
     WHERE b.status <> 'expired' ORDER BY b.id DESC LIMIT 300`,
  );
