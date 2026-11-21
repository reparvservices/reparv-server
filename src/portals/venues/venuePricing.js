/**
 * Pure venue-booking rules (no DB, no clock unless passed in) so they can be unit-tested.
 * Dates are plain "YYYY-MM-DD" strings; the check-out (end) date is exclusive.
 */

export const SLOTS = ["full", "morning", "evening"];
const DAY_MS = 86_400_000;

const isoToUtc = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  // reject 2026-02-31 style overflow
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? t : null;
};
export const isValidDate = (iso) => isoToUtc(iso) !== null;
export const addDays = (iso, n) => new Date(isoToUtc(iso) + n * DAY_MS).toISOString().slice(0, 10);
export const diffDays = (fromIso, toIso) => Math.round((isoToUtc(toIso) - isoToUtc(fromIso)) / DAY_MS);

/** Every date in [start, end) */
export function eachDate(start, end) {
  const out = [];
  for (let d = start; diffDays(d, end) > 0; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Friday and Saturday nights are "weekend" (the night that starts on that date). */
export function isWeekendNight(iso) {
  const dow = new Date(isoToUtc(iso)).getUTCDay(); // 0 Sun .. 6 Sat
  return dow === 5 || dow === 6;
}

/**
 * Validate and normalise a requested stay against a listing.
 * Night listings need start < end; slot listings use one date + a slot (end is derived).
 * @returns {{ ok: true, start: string, end: string, slot: string, nights: number } | { ok: false, message: string }}
 */
export function normaliseStay(listing, { start_date, end_date, slot }, today) {
  if (!isValidDate(start_date)) return { ok: false, message: "A valid start date (YYYY-MM-DD) is required." };
  if (diffDays(today, start_date) < 0) return { ok: false, message: "The start date is in the past." };

  if (listing.price_model === "slot") {
    const s = SLOTS.includes(slot) ? slot : null;
    if (!s) return { ok: false, message: "Choose a slot: full, morning or evening." };
    // A full-day booking may cover several consecutive days (end_date = the day after the last day).
    // Morning / evening slots are always a single day.
    if (s === "full" && end_date !== undefined && end_date !== null && end_date !== "") {
      if (!isValidDate(end_date)) return { ok: false, message: "A valid end date (YYYY-MM-DD) is required." };
      const days = diffDays(start_date, end_date);
      if (days < 1) return { ok: false, message: "The last day must be on or after the first day." };
      const max = listing.max_nights || 30;
      if (days > max) return { ok: false, message: `Maximum booking is ${max} days.` };
      return { ok: true, start: start_date, end: end_date, slot: "full", nights: days };
    }
    return { ok: true, start: start_date, end: addDays(start_date, 1), slot: s, nights: 1 };
  }

  if (!isValidDate(end_date)) return { ok: false, message: "A valid end date (YYYY-MM-DD) is required." };
  const nights = diffDays(start_date, end_date);
  if (nights < 1) return { ok: false, message: "Check-out must be after check-in." };
  if (nights < (listing.min_nights || 1)) return { ok: false, message: `Minimum stay is ${listing.min_nights} night(s).` };
  if (nights > (listing.max_nights || 30)) return { ok: false, message: `Maximum stay is ${listing.max_nights} nights.` };
  return { ok: true, start: start_date, end: end_date, slot: "full", nights };
}

/** Two stays on the same listing clash when their dates overlap and their slots overlap. */
export function staysOverlap(a, b) {
  const datesOverlap = diffDays(a.start, b.end) > 0 && diffDays(b.start, a.end) > 0;
  if (!datesOverlap) return false;
  return a.slot === "full" || b.slot === "full" || a.slot === b.slot;
}

/**
 * Price a stay. All money is whole rupees (GST rounded to the nearest rupee).
 * Slot price: `full` costs base_price, a half-day slot costs 60% of it (rounded up).
 */
export function quoteStay(listing, stay) {
  const base = Number(listing.base_price) || 0;
  const weekend = listing.weekend_price ? Number(listing.weekend_price) : base;
  const lines = [];

  if (listing.price_model === "slot") {
    const slotBase = stay.slot === "full" ? base : Math.ceil(base * 0.6);
    const slotWeekend = stay.slot === "full" ? weekend : Math.ceil(weekend * 0.6);
    // one line per day (a half-day slot is always a single day)
    for (const d of eachDate(stay.start, stay.end)) {
      lines.push({ date: d, label: `${stay.slot} slot`, amount: isWeekendNight(d) ? slotWeekend : slotBase });
    }
  } else {
    for (const d of eachDate(stay.start, stay.end)) {
      lines.push({ date: d, label: isWeekendNight(d) ? "weekend night" : "night", amount: isWeekendNight(d) ? weekend : base });
    }
  }

  const stayTotal = lines.reduce((s, l) => s + l.amount, 0);
  const cleaning = Number(listing.cleaning_fee) || 0;
  const subtotal = stayTotal + cleaning;
  const gst = Math.round((subtotal * (Number(listing.gst_percent) || 0)) / 100);
  const total = subtotal + gst;
  const depositPct = Math.min(100, Math.max(1, Number(listing.deposit_percent) || 100));
  const payableNow = depositPct >= 100 ? total : Math.ceil((total * depositPct) / 100);

  return {
    lines,
    stay_total: stayTotal,
    cleaning_fee: cleaning,
    subtotal,
    gst_percent: Number(listing.gst_percent) || 0,
    gst_amount: gst,
    total_amount: total,
    deposit_percent: depositPct,
    payable_now: payableNow,
    balance_due: total - payableNow,
  };
}

const POLICIES = {
  // [days before check-in at-or-above which, refund % of the amount paid], checked in order
  flexible: [[2, 100], [1, 50]],
  moderate: [[7, 100], [3, 50]],
  strict: [[14, 50]],
};

/** Refund (whole rupees) when the customer cancels `startDate` booking on `today`. */
export function refundFor(policy, amountPaid, startDate, today) {
  const daysBefore = diffDays(today, startDate);
  const tiers = POLICIES[policy] || POLICIES.moderate;
  let pct = 0;
  for (const [minDays, p] of tiers) {
    if (daysBefore >= minDays) { pct = p; break; }
  }
  return { percent: pct, amount: Math.floor((Number(amountPaid) * pct) / 100), days_before: daysBefore };
}

export const policyText = (policy) =>
  ({
    flexible: "Full refund up to 2 days before check-in, 50% up to 1 day before, none after.",
    moderate: "Full refund up to 7 days before check-in, 50% up to 3 days before, none after.",
    strict: "50% refund up to 14 days before check-in, none after.",
  })[policy] || "";
