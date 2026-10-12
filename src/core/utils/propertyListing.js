/**
 * Partner listing classification.
 *
 * listingType  : Sell | Buy | Rent   (Buy = partner's buying requirement)
 * propertyKind : Residential | Commercial | Agriculture
 *
 * Older rows have NULL in both columns; values are derived from
 * propertyCategory so existing listings keep working.
 */

export const LISTING_TYPES = ["Sell", "Buy", "Rent"];
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
  // Non-rental category: keep a stored Sell/Buy choice
  const stored = normalizeListingType(existing?.listingType);
  return stored && stored !== "Rent" ? stored : "Sell";
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
