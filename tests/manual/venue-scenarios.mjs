// Venue booking scenarios: REAL service + LOCAL DB + fake Razorpay (needs a local .env; cleans up after itself).
// Run from reparv-server:  node --experimental-test-module-mocks tests/manual/venue-scenarios.mjs
import { mock } from "node:test";
import crypto from "node:crypto";
import mysql from "mysql2/promise";

process.loadEnvFile(".env");
process.env.RAZORPAY_KEY_ID = "rzp_test_fake";
process.env.RAZORPAY_KEY_SECRET = "fake_secret_for_scenarios";

const orders = new Map(), payments = new Map(), refunds = [];
class FakeRazorpay {
  orders = {
    create: async (o) => { const id = "order_" + crypto.randomBytes(6).toString("hex"); orders.set(id, { id, ...o }); return orders.get(id); },
    fetch: async (id) => { if (!orders.has(id)) throw new Error("no order"); return orders.get(id); },
  };
  payments = {
    fetch: async (id) => ({ ...payments.get(id) }),
    capture: async (id) => { payments.get(id).status = "captured"; return { ...payments.get(id) }; },
    refund: async (id, body) => { const r = { id: "rfnd_" + crypto.randomBytes(4).toString("hex"), payment_id: id, ...body }; refunds.push(r); return r; },
  };
}
mock.module("razorpay", { defaultExport: FakeRazorpay });

const root = new URL("../../src/portals/venues/", import.meta.url).pathname;
const svc = await import(root + "venueService.js");
const own = await import(root + "venueOwnerService.js");
const P = await import(root + "venuePricing.js");

const pool = await mysql.createPool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT) || 3306, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
const q = async (s, p) => (await pool.query(s, p))[0];

const cust = (await q("SELECT id, fullname, contact FROM guestUsers ORDER BY id LIMIT 2"));
const [c1, c2] = cust;
const sign = (o, p) => crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(`${o}|${p}`).digest("hex");
const rej = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
let pass = 0, fail = 0;
const check = (n, c, x = "") => { (c ? pass++ : fail++); console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  " + x}`); };

const today = svc.todayIST();
const d = (n) => P.addDays(today, n);
const OWNER = { role: "project", id: 785 }, OTHER = { role: "project", id: 786 };
const maxListing = (await q("SELECT COALESCE(MAX(id),0) m FROM venue_listings"))[0].m;
const pay = (order, over = {}) => {
  const id = "pay_" + crypto.randomBytes(6).toString("hex");
  payments.set(id, { id, order_id: order.order_id, amount: order.amount, currency: "INR", status: "captured", ...over });
  return id;
};

try {
  console.log("== 1. listing lifecycle (partner -> admin)");
  let e = await rej(() => own.createListing(OWNER, { title: "x", type: "castle", price_model: "night", base_price: 5000, capacity: 5, city: "Nagpur" }));
  check("invalid type rejected", e?.statusCode === 400, e?.message);
  e = await rej(() => own.createListing(OWNER, { title: "x", type: "villa", price_model: "night", base_price: 5, capacity: 5, city: "Nagpur" }));
  check("absurd price rejected", e?.statusCode === 400, e?.message);
  const villa = await own.createListing(OWNER, { title: "Lake View Villa", type: "villa", price_model: "night", base_price: 10000, weekend_price: 15000, cleaning_fee: 1000, capacity: 8, bedrooms: 3, city: "Nagpur", deposit_percent: 30, images: ["https://x.test/a.jpg"], cancellation_policy: "moderate" });
  const hall = await own.createListing(OWNER, { title: "Grand Hall", type: "hall", price_model: "slot", base_price: 50000, capacity: 300, city: "Nagpur", images: ["https://x.test/h.jpg"] });
  check("created as draft", villa.status === "draft");
  e = await rej(() => svc.getPublicListing(villa.id));
  check("draft is not public", e?.statusCode === 404);
  e = await rej(() => own.setListingStatus(OTHER, villa.id, "submit"));
  check("another partner cannot touch it", e?.statusCode === 404);
  await own.setListingStatus(OWNER, villa.id, "submit"); await own.setListingStatus(OWNER, hall.id, "submit");
  e = await rej(() => svc.getPublicListing(villa.id));
  check("pending is not public", e?.statusCode === 404);
  await own.adminDecide(villa.id, { action: "approve" }); await own.adminDecide(hall.id, { action: "approve", commission_percent: 12 });
  const pub = await svc.getPublicListing(villa.id);
  check("live listing is public, owner fields hidden", pub.title === "Lake View Villa" && pub.owner_id === undefined && pub.commission_percent === undefined);
  const search = await svc.searchListings({ city: "Nagpur", guests: 10 });
  check("search filters by capacity", search.listings.some((l) => l.id === hall.id) && !search.listings.some((l) => l.id === villa.id));

  console.log("== 2. quote + validation");
  const qt = await svc.quoteForListing(villa.id, { start_date: d(20), end_date: d(23), guests: 4 });
  check("quote has server-side totals", qt.quote.total_amount > 0 && qt.quote.payable_now < qt.quote.total_amount, JSON.stringify(qt.quote));
  e = await rej(() => svc.quoteForListing(villa.id, { start_date: d(20), end_date: d(23), guests: 50 }));
  check("over-capacity rejected", e?.statusCode === 400, e?.message);
  e = await rej(() => svc.quoteForListing(villa.id, { start_date: d(-3), end_date: d(1) }));
  check("past date rejected", e?.statusCode === 400);

  console.log("== 3. booking + payment");
  const b1 = await svc.createBooking({ customer: c1, listingId: villa.id, input: { start_date: d(20), end_date: d(23), guests: 4 } });
  check("hold + order created for the deposit", b1.order_id && b1.amount === b1.quote.payable_now * 100 && orders.get(b1.order_id).notes.checkout === "venue_booking");
  e = await rej(() => svc.createBooking({ customer: c2, listingId: villa.id, input: { start_date: d(22), end_date: d(25), guests: 2 } }));
  check("overlapping dates blocked while held (409)", e?.statusCode === 409, e?.message);
  const ok2 = await svc.createBooking({ customer: c2, listingId: villa.id, input: { start_date: d(23), end_date: d(25), guests: 2 } });
  check("back-to-back stay (check-in on the other's check-out day) is allowed", !!ok2.order_id);
  const av = await svc.getAvailability(villa.id, d(18), d(30));
  check("availability shows both holds", av.booked.length === 2);

  e = await rej(() => svc.verifyBookingPayment({ customer: c1, razorpay_order_id: b1.order_id, razorpay_payment_id: "pay_x", razorpay_signature: "bad" }));
  check("bad signature rejected", e?.statusCode === 400);
  const p1 = pay(b1);
  e = await rej(() => svc.verifyBookingPayment({ customer: c2, razorpay_order_id: b1.order_id, razorpay_payment_id: p1, razorpay_signature: sign(b1.order_id, p1) }));
  check("another customer cannot confirm my booking (403)", e?.statusCode === 403, e?.message);
  const pUnder = pay(b1, { amount: 100 });
  e = await rej(() => svc.verifyBookingPayment({ customer: c1, razorpay_order_id: b1.order_id, razorpay_payment_id: pUnder, razorpay_signature: sign(b1.order_id, pUnder) }));
  check("underpaid rejected", e?.statusCode === 400, e?.message);
  const pFail = pay(b1, { status: "failed" });
  e = await rej(() => svc.verifyBookingPayment({ customer: c1, razorpay_order_id: b1.order_id, razorpay_payment_id: pFail, razorpay_signature: sign(b1.order_id, pFail) }));
  check("failed payment rejected", e && e.statusCode >= 400, e?.message);
  check("still held after bad attempts", (await q("SELECT status FROM venue_bookings WHERE id=?", [b1.booking_id]))[0].status === "held");

  const results = await Promise.allSettled(Array.from({ length: 6 }, () => svc.verifyBookingPayment({ customer: c1, razorpay_order_id: b1.order_id, razorpay_payment_id: p1, razorpay_signature: sign(b1.order_id, p1) })));
  const row1 = (await q("SELECT status, amount_paid, razorpay_payment_id FROM venue_bookings WHERE id=?", [b1.booking_id]))[0];
  check("6 parallel verifies -> confirmed once", row1.status === "confirmed" && row1.amount_paid === b1.quote.payable_now && results.every((r) => r.status === "fulfilled" || r.reason?.statusCode === 409), JSON.stringify(results.map((r) => r.status === "fulfilled" ? "ok" : r.reason?.statusCode)));
  const again = await svc.verifyBookingPayment({ customer: c1, razorpay_order_id: b1.order_id, razorpay_payment_id: p1, razorpay_signature: sign(b1.order_id, p1) });
  check("replay is a no-op success", again.success === true);

  console.log("== 4. concurrent holds for the same dates");
  const racers = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => svc.createBooking({ customer: i % 2 ? c1 : c2, listingId: hall.id, input: { start_date: d(40), slot: "full", guests: 100 } })));
  const won = racers.filter((r) => r.status === "fulfilled");
  check("exactly 1 of 8 simultaneous holds wins", won.length === 1, `${won.length} won`);
  check("the rest got 409", racers.filter((r) => r.status === "rejected").every((r) => r.reason?.statusCode === 409));

  console.log("== 5. half-day slots");
  await svc.createBooking({ customer: c1, listingId: hall.id, input: { start_date: d(50), slot: "morning", guests: 50 } });
  const eve = await svc.createBooking({ customer: c2, listingId: hall.id, input: { start_date: d(50), slot: "evening", guests: 50 } });
  check("morning and evening of the same day both bookable", !!eve.order_id);
  e = await rej(() => svc.createBooking({ customer: c2, listingId: hall.id, input: { start_date: d(50), slot: "full", guests: 50 } }));
  check("full day clashes with a half-day slot", e?.statusCode === 409);

  console.log("== 6. owner blocks dates");
  await own.blockDates(OWNER, villa.id, { from: d(60), to: d(62), reason: "Family stay" });
  e = await rej(() => svc.createBooking({ customer: c1, listingId: villa.id, input: { start_date: d(61), end_date: d(63), guests: 2 } }));
  check("blocked dates cannot be booked", e?.statusCode === 409, e?.message);
  e = await rej(() => own.blockDates(OTHER, villa.id, { from: d(70), to: d(71) }));
  check("only the owner can block", e?.statusCode === 404);

  console.log("== 7. order.paid webhook (app closed)");
  const bw = await svc.createBooking({ customer: c2, listingId: villa.id, input: { start_date: d(80), end_date: d(82), guests: 2 } });
  const pw = pay(bw);
  const w1 = await svc.handleVenueOrderPaidWebhook({ payment: { entity: { id: pw, order_id: bw.order_id } }, order: { entity: { id: bw.order_id } } });
  check("webhook confirms the booking", w1.handled === true && (await q("SELECT status FROM venue_bookings WHERE id=?", [bw.booking_id]))[0].status === "confirmed", JSON.stringify(w1));
  const w2 = await svc.handleVenueOrderPaidWebhook({ payment: { entity: { id: pw, order_id: bw.order_id } } });
  check("webhook retry is idempotent", w2.handled === true);
  orders.set("order_other", { id: "order_other", notes: {} });
  check("foreign order ignored", (await svc.handleVenueOrderPaidWebhook({ payment: { entity: { id: "pay_z", order_id: "order_other" } } })).handled === false);

  console.log("== 8. pay after the hold ran out");
  const bl = await svc.createBooking({ customer: c1, listingId: villa.id, input: { start_date: d(90), end_date: d(92), guests: 2 } });
  await q("UPDATE venue_bookings SET hold_expires_at = NOW() - INTERVAL 5 MINUTE WHERE id=?", [bl.booking_id]);
  const rival = await svc.createBooking({ customer: c2, listingId: villa.id, input: { start_date: d(90), end_date: d(92), guests: 2 } });
  check("expired hold frees the dates", !!rival.order_id);
  const pl = pay(bl);
  const nRef = refunds.length;
  e = await rej(() => svc.verifyBookingPayment({ customer: c1, razorpay_order_id: bl.order_id, razorpay_payment_id: pl, razorpay_signature: sign(bl.order_id, pl) }));
  check("late payment loses to the rival (409)", e?.statusCode === 409, e?.message);
  check("late payment is refunded in full", refunds.length === nRef + 1 && refunds.at(-1).amount === bl.amount, JSON.stringify(refunds.at(-1)));
  const rp = pay(rival);
  await svc.verifyBookingPayment({ customer: c2, razorpay_order_id: rival.order_id, razorpay_payment_id: rp, razorpay_signature: sign(rival.order_id, rp) });
  check("rival confirms fine", (await q("SELECT status FROM venue_bookings WHERE id=?", [rival.booking_id]))[0].status === "confirmed");

  console.log("== 9. cancellation + refunds");
  e = await rej(() => svc.cancelBooking({ bookingId: b1.booking_id, actor: "customer", customerId: c2.id }));
  check("cannot cancel someone else's booking", e?.statusCode === 403);
  const n1 = refunds.length;
  const c = await svc.cancelBooking({ bookingId: b1.booking_id, actor: "customer", customerId: c1.id, reason: "plans changed" });
  check("20 days out (moderate): full refund of what was paid", c.refund_percent === 100 && c.refund_amount === b1.quote.payable_now && refunds.length === n1 + 1 && refunds.at(-1).amount === b1.quote.payable_now * 100, JSON.stringify(c));
  e = await rej(() => svc.cancelBooking({ bookingId: b1.booking_id, actor: "customer", customerId: c1.id }));
  check("cancelling twice is rejected", e?.statusCode === 409);
  const av2 = await svc.getAvailability(villa.id, d(18), d(26));
  check("cancelled dates are free again", !av2.booked.some((b) => b.start === d(20)));
  await q("UPDATE venue_bookings SET start_date = ?, end_date = ? WHERE id=?", [d(1), d(3), bw.booking_id]); // now 1 day out
  const c3 = await svc.cancelBooking({ bookingId: bw.booking_id, actor: "customer", customerId: c2.id });
  check("1 day out (moderate): no refund", c3.refund_percent === 0 && c3.refund_amount === 0 && c3.refund_status === "none", JSON.stringify(c3));
  const n2 = refunds.length;
  const c4 = await svc.cancelBooking({ bookingId: rival.booking_id, actor: "owner", ownerKey: OWNER });
  check("owner cancelling refunds 100% regardless of policy", c4.refund_percent === 100 && refunds.length === n2 + 1);
  e = await rej(() => svc.cancelBooking({ bookingId: eve.booking_id, actor: "owner", ownerKey: OTHER }));
  check("another owner cannot cancel it", e?.statusCode === 403);

  console.log("== 10. expiry job");
  const old = await svc.createBooking({ customer: c1, listingId: hall.id, input: { start_date: d(120), slot: "full", guests: 10 } });
  await q("UPDATE venue_bookings SET hold_expires_at = NOW() - INTERVAL 3 HOUR WHERE id=?", [old.booking_id]);
  const job = await svc.expireHolds();
  check("old unpaid hold marked expired", job.expired >= 1 && (await q("SELECT status FROM venue_bookings WHERE id=?", [old.booking_id]))[0].status === "expired", JSON.stringify(job));

  console.log("== 11. partner/customer listings");
  const mine = await own.listOwnerBookings(OWNER);
  check("owner sees only confirmed/completed/cancelled bookings of own listings", mine.length > 0 && mine.every((b) => ["confirmed", "completed", "cancelled"].includes(b.status)));
  check("other partner sees none", (await own.listOwnerBookings(OTHER)).length === 0);
  const mb = await svc.listCustomerBookings(c1.id);
  check("customer sees own bookings", mb.length > 0 && mb.every((b) => b.customer_id === undefined || b.customer_id === c1.id));
} catch (err) {
  fail++; console.log("  FAIL  unexpected error:", err);
} finally {
  await q("DELETE FROM venue_bookings WHERE listing_id > ?", [maxListing]);
  await q("DELETE FROM venue_blocked_dates WHERE listing_id > ?", [maxListing]);
  await q("DELETE FROM venue_listings WHERE id > ?", [maxListing]);
  await q("DELETE FROM subscription_payment_claims WHERE role = 'venue'");
  const left = (await q("SELECT (SELECT COUNT(*) FROM venue_listings) l, (SELECT COUNT(*) FROM venue_bookings) b"))[0];
  console.log(`\nleft in DB: listings=${left.l} bookings=${left.b}`);
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  await pool.end();
  process.exit(fail ? 1 : 0);
}
