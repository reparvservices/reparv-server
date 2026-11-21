/**
 * One definition of which `properties` columns a listing form can fill, shared by the admin,
 * partner and website save endpoints, so every panel stores the same fields the same way.
 *
 * collectPropertyColumns(body, { mode, privileged }) -> { columns, values, error? }
 *   mode "add"  : a column is included only when the form sent a value
 *   mode "edit" : a column is changed only when the form sent the key (empty clears it);
 *                 photos are replaced only by a non-empty list, so omitting a section keeps its photos
 *   privileged  : admin / partner only. Website customers can't set builder / approval columns.
 */
import moment from "moment-timezone";
import {
  LISTING_IMAGE_KEYS,
  parseImageList,
  toPropertyTypeJson,
} from "./propertyListing.js";
import {
  pickPropertyVideoLinkUpdates,
  pickPropertyVideoFileUpdate,
  pickBrochureFileUpdate,
} from "./videoLinks.js";

/** Single-value text / number / date columns */
export const PROPERTY_TEXT_COLUMNS = [
  "projectBy", "contact", "email",
  "location", "distanceFromCityCenter", "address", "pincode", "latitude", "longitude",
  "totalSalesPrice", "totalOfferPrice",
  "stampDuty", "registrationFee", "gst", "advocateFee", "msebWater", "maintenance", "other", "tags",
  "possessionDate", "builtYear", "ownershipType", "builtUpArea", "carpetArea",
  "parkingAvailability", "totalFloors", "floorNo", "loanAvailability", "propertyFacing",
  "reraRegistered", "furnishing", "waterSupply", "powerBackup",
  "sizeAreaFeature", "parkingFeature", "terraceFeature", "ageOfPropertyFeature", "propertyStatusFeature",
  "propertyDescription",
];

/** Columns holding a JSON list of chosen options */
export const PROPERTY_LIST_COLUMNS = [
  "locationFeature", "amenitiesFeature", "smartHomeFeature",
  "securityBenefit", "primeLocationBenefit", "rentalIncomeBenefit",
  "qualityBenefit", "capitalAppreciationBenefit", "ecofriendlyBenefit",
];

/** Set only by admin / partner panels */
const PRIVILEGED_COLUMNS = ["builderid", "propertyApprovedBy"];

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const CONTACT_PATTERN = /^[6-9]\d{9}$/;

const MAX = { propertyDescription: 3000, tags: 500, address: 500, location: 100 };

const isMissing = (v) => v === undefined;
const clean = (v) => (v === null || v === undefined ? "" : String(v).trim());

/** A list column value as JSON text (or null): accepts an array or already-stored JSON text */
const listJson = (value) => {
  let list = value;
  if (typeof list === "string") {
    const text = list.trim();
    if (!text) return null;
    try {
      list = JSON.parse(text);
    } catch {
      list = text.split(",");
    }
  }
  if (!Array.isArray(list)) return null;
  const items = list.map((v) => String(v ?? "").trim().slice(0, 100)).filter(Boolean).slice(0, 40);
  return items.length ? JSON.stringify(items) : null;
};

export function collectPropertyColumns(body = {}, { mode = "add", privileged = false } = {}) {
  const columns = [];
  const values = [];
  const put = (column, value) => {
    columns.push(column);
    values.push(value);
  };
  const edit = mode === "edit";

  // Single-value columns
  for (const column of [...PROPERTY_TEXT_COLUMNS, ...(privileged ? PRIVILEGED_COLUMNS : [])]) {
    const raw = body[column];
    if (isMissing(raw)) continue;
    let text = clean(raw);
    if (text === "") {
      if (edit) put(column, null);
      continue;
    }
    if (MAX[column] && text.length > MAX[column]) {
      return { error: `${column === "propertyDescription" ? "Description" : column} is too long` };
    }
    if (column === "email") {
      if (text.length > 254 || !EMAIL_PATTERN.test(text)) return { error: "Enter a valid email address" };
      text = text.toLowerCase();
    } else if (column === "contact") {
      if (!CONTACT_PATTERN.test(text)) return { error: "Enter a valid 10-digit contact number" };
    } else if (column === "possessionDate") {
      if (!moment(text).isValid()) {
        if (edit) put(column, null);
        continue;
      }
      text = moment(text).format("YYYY-MM-DD");
    } else if (column === "pincode") {
      if (!/^[1-9]\d{5}$/.test(text)) return { error: "Enter a valid 6-digit pincode" };
    } else if (column === "latitude" || column === "longitude") {
      const n = Number(text);
      const limit = column === "latitude" ? 90 : 180;
      if (!Number.isFinite(n) || Math.abs(n) > limit) return { error: "Invalid map location" };
      text = n.toFixed(8);
    }
    put(column, text);
  }

  // Lists of chosen options (features, benefits)
  for (const column of PROPERTY_LIST_COLUMNS) {
    if (isMissing(body[column])) continue;
    const json = listJson(body[column]);
    if (json === null && !edit) continue;
    put(column, json);
  }

  // Configuration (BHK), stored as a JSON list
  if (!isMissing(body.propertyType)) {
    const json = toPropertyTypeJson(body.propertyType);
    if (json !== null || edit) put("propertyType", json);
  }

  // Photos: every section the forms have.
  // A form can name sections in `replacePhotos`: for those the list it sends IS the whole section, so a
  // saved photo can be removed (the list may be shorter, or empty for an optional section). For any other
  // section an empty value keeps the saved photos, as before.
  const replacePhotos = edit && Array.isArray(body.replacePhotos) ? new Set(body.replacePhotos) : new Set();
  for (const key of LISTING_IMAGE_KEYS) {
    const list = parseImageList(body[key]);
    if (replacePhotos.has(key)) {
      if (key === "frontView" && list.length === 0) return { error: "At least one front view photo is required" };
      put(key, JSON.stringify(list));
    } else if (list.length) put(key, JSON.stringify(list));
    else if (!edit) put(key, "[]");
  }

  // Video links, uploaded video, brochure
  const links = pickPropertyVideoLinkUpdates(body);
  const file = pickPropertyVideoFileUpdate(body);
  const brochure = pickBrochureFileUpdate(body);
  const error = links.error || file.error || brochure.error;
  if (error) return { error };
  for (const [column, value] of Object.entries({ ...links.fields, ...file.fields, ...brochure.fields })) {
    put(column, value);
  }

  return { columns, values };
}
