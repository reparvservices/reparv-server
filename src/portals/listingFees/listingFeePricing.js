/**
 * Pure rules for paid website-user listings (no DB, no clock) so they can be unit-tested.
 *
 *  - The first `free_per_user` listings a user creates after the admin switches the feature on are free.
 *  - After that the fee depends on the property type (and optionally Sell / Rent), set by the admin.
 *  - Admin amounts exclude GST; GST is added on top, like subscriptions.
 */
import { splitGstFromBase } from "../subscription/utils/gstCalculation.js";

export const LISTING_TYPES = ["Sell", "Rent"];

const wholeRupees = (v) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Base fee (excluding GST) for a property type. Most specific rule wins:
 * category + Sell/Rent, then category for either, then the default fee.
 */
export function resolveBaseFee({ defaultFee = 0, rules = [] } = {}, { listingType, category } = {}) {
  const type = LISTING_TYPES.includes(listingType) ? listingType : null;
  const forCategory = rules.filter((r) => r.property_category === category);
  const exact = type && forCategory.find((r) => r.listing_type === type);
  if (exact) return wholeRupees(exact.amount);
  const any = forCategory.find((r) => r.listing_type === "Any");
  if (any) return wholeRupees(any.amount);
  return wholeRupees(defaultFee);
}

/** { base, gst, total } in whole rupees. */
export function feeBreakdown(base, rate) {
  const { base: b, gst, total } = splitGstFromBase(wholeRupees(base), rate);
  return { base: b, gst, total };
}

/**
 * What happens to a new listing.
 *  mode "off"    : the feature is switched off, nothing changes
 *  mode "free"   : uses one of the user's free listings
 *  mode "waived" : not free, but the configured fee is 0, so nothing to pay (does not use the allowance)
 *  mode "paid"   : the user has to pay `fee.total`
 */
export function decideListingFee({ settings, rules, freeUsed = 0, listingType, category, gstRate }) {
  if (!settings || !Number(settings.enabled)) return { mode: "off", fee: feeBreakdown(0, gstRate) };
  const freeAllowed = Math.max(0, Number(settings.free_per_user) || 0);
  if (Number(freeUsed) < freeAllowed) return { mode: "free", fee: feeBreakdown(0, gstRate) };
  const base = resolveBaseFee({ defaultFee: settings.default_fee, rules }, { listingType, category });
  if (base <= 0) return { mode: "waived", fee: feeBreakdown(0, gstRate) };
  return { mode: "paid", fee: feeBreakdown(base, gstRate) };
}

/** Validation for what the admin types in. Returns an error message or null. */
export function validateRule({ listing_type, property_category, amount }) {
  if (!["Sell", "Rent", "Any"].includes(listing_type)) return "Choose Sell, Rent or Any.";
  if (!String(property_category || "").trim()) return "Choose a property type.";
  if (String(property_category).length > 60) return "Property type is too long.";
  const n = Number(amount);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000 || !Number.isInteger(n)) return "Enter a whole amount from 0 to 10,00,000.";
  return null;
}

export function validateSettings({ free_per_user, default_fee }) {
  const free = Number(free_per_user);
  if (!Number.isInteger(free) || free < 0 || free > 100) return "Free listings per user must be a whole number from 0 to 100.";
  const fee = Number(default_fee);
  if (!Number.isInteger(fee) || fee < 0 || fee > 1_000_000) return "Default fee must be a whole amount from 0 to 10,00,000.";
  return null;
}
