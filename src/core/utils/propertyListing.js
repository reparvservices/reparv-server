/**
 * Partner listing classification.
 *
 * listingType  : Sell | Rent
 *   ("Buy" requirements were removed: a requirement is not a property, so
 *    it doesn't belong in the properties table. Requests with it are rejected.)
 * propertyKind : Residential | Commercial | Agriculture
 *
 * Older rows have NULL in both columns; values are derived from
 * propertyCategory so existing listings keep working.
 */

export const LISTING_TYPES = ["Sell", "Rent"];

export const BUY_LISTING_REMOVED_MESSAGE =
  "Listing type 'Buy' is no longer supported. Please list the property for Sell or Rent.";

/** True when a request still asks for the removed "Buy" listing type */
export const isBuyListingType = (value) =>
  typeof value === "string" && value.trim().toLowerCase() === "buy";
export const PROPERTY_KINDS = ["Residential", "Commercial", "Agriculture"];

const COMMERCIAL_CATEGORIES = new Set([
  "NewShop",
  "Shop",
  "OfficeSpace",
  "Showrooms",
  "Warehouse",
  "CommercialPlot",
  "CommercialFlat",
  "IndustrialSpace",
  "ResaleShop",
  "ResaleOffice",
  "ResaleGodown",
  "ResaleWarehouse",
  "ResaleShowroom",
  "ResaleShowRoom",
  "ResaleCommercial",
  "RentalShop",
  "RentalOffice",
  "RentalGodown",
  "RentalWarehouse",
  "RentalShowroom",
  "RentalShowRoom",
]);

const AGRICULTURE_CATEGORIES = new Set([
  "FarmLand",
  "FarmHouse",
  "ResaleFarmLand",
  "ResaleFarmHouse",
  "RentalOpenLand",
  "RentalLand",
  "RentalFarmHouse",
]);

const pick = (value, allowed) => {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return allowed.find((a) => a.toLowerCase() === v) || null;
};

export const normalizeListingType = (value) => pick(value, LISTING_TYPES);
export const normalizePropertyKind = (value) => pick(value, PROPERTY_KINDS);

export const deriveListingType = (propertyCategory) =>
  String(propertyCategory || "").startsWith("Rental") ? "Rent" : "Sell";

export const derivePropertyKind = (propertyCategory) => {
  const c = String(propertyCategory || "");
  if (!c) return null;
  if (AGRICULTURE_CATEGORIES.has(c)) return "Agriculture";
  if (COMMERCIAL_CATEGORIES.has(c)) return "Commercial";
  return "Residential";
};

/**
 * Resolve the values to store. Explicit (valid) input wins, then the stored
 * value (on edit), then a value derived from the category.
 */
const resolveListingType = (listingType, category, existing) => {
  const explicit = normalizeListingType(listingType);
  if (explicit) return explicit;
  if (deriveListingType(category) === "Rent") return "Rent";
  return "Sell";
};

export const resolveListingFields = ({
  listingType,
  propertyKind,
  propertyCategory,
  existing = null,
}) => ({
  listingType: resolveListingType(
    listingType,
    propertyCategory ?? existing?.propertyCategory,
    existing,
  ),
  propertyKind:
    normalizePropertyKind(propertyKind) ||
    (propertyCategory && propertyCategory !== existing?.propertyCategory
      ? derivePropertyKind(propertyCategory)
      : normalizePropertyKind(existing?.propertyKind) ||
        derivePropertyKind(propertyCategory ?? existing?.propertyCategory)),
});

/** Fill listingType/propertyKind on rows read from the DB (NULL on old rows). */
export const withListingFields = (row) =>
  row
    ? {
        ...row,
        listingType:
          normalizeListingType(row.listingType) ||
          deriveListingType(row.propertyCategory),
        propertyKind:
          normalizePropertyKind(row.propertyKind) ||
          derivePropertyKind(row.propertyCategory),
      }
    : row;

/**
 * SQL condition that hides Buy requirements from public / buyer-facing
 * property lists. `alias` is the table alias incl. dot, e.g. "p." .
 * Kept as a safety net for any legacy "Buy" rows (none exist today).
 */
export const notBuyRequirementSql = (alias = "") =>
  `(${alias}listingType IS NULL OR ${alias}listingType <> 'Buy')`;

/** Optional basic-info fields the add forms may send (all nullable text). */
export const BASIC_DETAIL_FIELDS = [
  "furnishing",
  "floorNo",
  "totalFloors",
  "propertyFacing",
  "parkingAvailability",
  "powerBackup",
  "waterSupply",
  "ownershipType",
];

/** { columns, values } for the basic-info fields present in a request body */
export const pickBasicDetails = (body = {}) => {
  const columns = [];
  const values = [];
  BASIC_DETAIL_FIELDS.forEach((key) => {
    const v = body[key];
    if (v === undefined || v === null || String(v).trim() === "") return;
    columns.push(key);
    values.push(String(v).trim());
  });
  return { columns, values };
};

/**
 * Listing details the website add form sends besides the basics:
 * configuration (BHK), locality, pincode, map pin and description.
 * Returns { columns, values } for the fields present, or { error }.
 */
export const pickListingExtras = (body = {}) => {
  const columns = [];
  const values = [];
  const add = (column, value) => {
    columns.push(column);
    values.push(value);
  };

  if (body.propertyType !== undefined && body.propertyType !== null && body.propertyType !== "") {
    const list = (Array.isArray(body.propertyType) ? body.propertyType : [body.propertyType])
      .map((v) => String(v).trim())
      .filter(Boolean);
    if (list.length > 10 || list.some((v) => v.length > 40)) {
      return { error: "Invalid property configuration" };
    }
    add("propertyType", JSON.stringify(list));
  }

  if (body.location !== undefined && String(body.location).trim() !== "") {
    const location = String(body.location).trim();
    if (location.length > 100) return { error: "Locality must be under 100 characters" };
    add("location", location);
  }

  if (body.pincode !== undefined && String(body.pincode).trim() !== "") {
    const pincode = String(body.pincode).trim();
    if (!/^[1-9]\d{5}$/.test(pincode)) return { error: "Enter a valid 6-digit pincode" };
    add("pincode", Number(pincode));
  }

  const hasLat = body.latitude !== undefined && String(body.latitude).trim() !== "";
  const hasLng = body.longitude !== undefined && String(body.longitude).trim() !== "";
  if (hasLat || hasLng) {
    const lat = Number(body.latitude);
    const lng = Number(body.longitude);
    if (!hasLat || !hasLng || !Number.isFinite(lat) || !Number.isFinite(lng) ||
        lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return { error: "Invalid map location" };
    }
    add("latitude", lat.toFixed(8));
    add("longitude", lng.toFixed(8));
  }

  if (body.propertyDescription !== undefined && String(body.propertyDescription).trim() !== "") {
    const description = String(body.propertyDescription).trim();
    if (description.length > 3000) return { error: "Description must be under 3000 characters" };
    add("propertyDescription", description);
  }

  return { columns, values };
};
