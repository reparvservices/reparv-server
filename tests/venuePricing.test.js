import test from "node:test";
import assert from "node:assert/strict";
import {
  normaliseStay,
  quoteStay,
  refundFor,
  staysOverlap,
  isWeekendNight,
  addDays,
  eachDate,
  diffDays,
} from "../src/portals/venues/venuePricing.js";

const villa = {
  price_model: "night", base_price: 10000, weekend_price: 15000, cleaning_fee: 1000,
  gst_percent: 18, deposit_percent: 30, min_nights: 2, max_nights: 10,
};
const hall = { price_model: "slot", base_price: 50000, weekend_price: null, cleaning_fee: 0, gst_percent: 18, deposit_percent: 100 };
const TODAY = "2026-12-01";

test("date helpers", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(diffDays("2026-12-01", "2026-12-04"), 3);
  assert.deepEqual(eachDate("2026-12-01", "2026-12-04"), ["2026-12-01", "2026-12-02", "2026-12-03"]);
  assert.equal(isWeekendNight("2026-12-04"), true); // Friday
  assert.equal(isWeekendNight("2026-12-05"), true); // Saturday
  assert.equal(isWeekendNight("2026-12-06"), false); // Sunday
});

test("night stay validation", () => {
  assert.equal(normaliseStay(villa, { start_date: "2026-11-30", end_date: "2026-12-03" }, TODAY).ok, false); // past
  assert.equal(normaliseStay(villa, { start_date: "2026-12-10", end_date: "2026-12-10" }, TODAY).ok, false); // 0 nights
  assert.equal(normaliseStay(villa, { start_date: "2026-12-10", end_date: "2026-12-11" }, TODAY).ok, false); // below min
  assert.equal(normaliseStay(villa, { start_date: "2026-12-10", end_date: "2026-12-30" }, TODAY).ok, false); // above max
  assert.equal(normaliseStay(villa, { start_date: "2026-02-31", end_date: "2026-03-02" }, TODAY).ok, false); // invalid date
  const ok = normaliseStay(villa, { start_date: "2026-12-10", end_date: "2026-12-13" }, TODAY);
  assert.deepEqual([ok.ok, ok.nights, ok.slot], [true, 3, "full"]);
});

test("slot stay validation derives the end date", () => {
  assert.equal(normaliseStay(hall, { start_date: "2026-12-10", slot: "night" }, TODAY).ok, false);
  const ok = normaliseStay(hall, { start_date: "2026-12-10", slot: "evening" }, TODAY);
  assert.deepEqual([ok.ok, ok.end, ok.slot], [true, "2026-12-11", "evening"]);
});

test("overlap: end date is exclusive and slots matter", () => {
  const a = { start: "2026-12-10", end: "2026-12-13", slot: "full" };
  assert.equal(staysOverlap(a, { start: "2026-12-13", end: "2026-12-15", slot: "full" }), false); // back to back
  assert.equal(staysOverlap(a, { start: "2026-12-12", end: "2026-12-14", slot: "full" }), true);
  assert.equal(staysOverlap(a, { start: "2026-12-09", end: "2026-12-11", slot: "full" }), true);
  const m = { start: "2026-12-10", end: "2026-12-11", slot: "morning" };
  assert.equal(staysOverlap(m, { start: "2026-12-10", end: "2026-12-11", slot: "evening" }), false);
  assert.equal(staysOverlap(m, { start: "2026-12-10", end: "2026-12-11", slot: "morning" }), true);
  assert.equal(staysOverlap(m, { start: "2026-12-10", end: "2026-12-11", slot: "full" }), true);
});

test("villa quote: weekend nights, cleaning fee, GST and deposit", () => {
  // Thu 3 Dec (10000), Fri 4 Dec (15000), Sat 5 Dec (15000) -> 40000 + 1000 cleaning
  const stay = { start: "2026-12-03", end: "2026-12-06", slot: "full" };
  const q = quoteStay(villa, stay);
  assert.equal(q.stay_total, 40000);
  assert.equal(q.subtotal, 41000);
  assert.equal(q.gst_amount, 7380);
  assert.equal(q.total_amount, 48380);
  assert.equal(q.payable_now, Math.ceil(48380 * 0.3)); // 14514
  assert.equal(q.balance_due, 48380 - q.payable_now);
  assert.equal(q.lines.length, 3);
});

test("hall quote: half-day slots cost 60%, full deposit", () => {
  assert.equal(quoteStay(hall, { start: "2026-12-07", end: "2026-12-08", slot: "full" }).stay_total, 50000);
  const m = quoteStay(hall, { start: "2026-12-07", end: "2026-12-08", slot: "morning" });
  assert.equal(m.stay_total, 30000);
  assert.equal(m.payable_now, m.total_amount);
  assert.equal(m.balance_due, 0);
});

test("refund tiers per policy", () => {
  assert.deepEqual(refundFor("moderate", 10000, "2026-12-20", "2026-12-10"), { percent: 100, amount: 10000, days_before: 10 });
  assert.equal(refundFor("moderate", 10000, "2026-12-13", "2026-12-10").percent, 50);
  assert.equal(refundFor("moderate", 10000, "2026-12-12", "2026-12-10").percent, 0);
  assert.equal(refundFor("flexible", 9999, "2026-12-11", "2026-12-10").amount, 4999);
  assert.equal(refundFor("strict", 10000, "2026-12-30", "2026-12-10").percent, 50);
  assert.equal(refundFor("strict", 10000, "2026-12-20", "2026-12-10").percent, 0);
  assert.equal(refundFor("moderate", 10000, "2026-12-01", "2026-12-10").percent, 0); // already started
});
