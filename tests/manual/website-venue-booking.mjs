// Website venue booking over HTTP: real routes + website login cookie + fake Razorpay + LOCAL test DB.
// Needs a throwaway MySQL (never the shared .env database). From reparv-server:
//   DB_HOST=127.0.0.1 DB_PORT=3399 DB_USER=root DB_PASSWORD= DB_NAME=venue_test \
//   node --experimental-test-module-mocks tests/manual/website-venue-booking.mjs
import { mock } from "node:test";
import crypto from "node:crypto";
import http from "node:http";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import mysql from "mysql2/promise";

process.loadEnvFile(".env");
if (!["127.0.0.1", "localhost"].includes(process.env.DB_HOST)) {
  console.error("Refusing to run: DB_HOST is not local (" + process.env.DB_HOST + ")");
  process.exit(1);
}
process.env.RAZORPAY_KEY_ID = "rzp_test_fake";
process.env.RAZORPAY_KEY_SECRET = "fake_secret_for_scenarios";
process.env.JWT_SECRET = process.env.JWT_SECRET || "local-test-secret";

const orders = new Map(), payments = new Map(), refunds = [];
class FakeRazorpay {
  orders = {
    create: async (o) => { const id = "order_" + crypto.randomBytes(6).toString("hex"); orders.set(id, { id, ...o }); return orders.get(id); },
    fetch: async (id) => orders.get(id),
  };
  payments = {
    fetch: async (id) => ({ ...payments.get(id) }),
    capture: async (id) => { payments.get(id).status = "captured"; return { ...payments.get(id) }; },
    refund: async (id, body) => { const r = { id: "rfnd_" + crypto.randomBytes(4).toString("hex"), payment_id: id, ...body }; refunds.push(r); return r; },
  };
}
mock.module("razorpay", { defaultExport: FakeRazorpay });

const root = new URL("../../src/", import.meta.url).pathname;
const { verifyToken } = await import(root + "core/middleware/verifyToken.js");
const { customerVenueRouter, websiteBookingRouter } = await import(root + "portals/venues/venueRoutes.js");
const own = await import(root + "portals/venues/venueOwnerService.js");
const svc = await import(root + "portals/venues/venueService.js");
const P = await import(root + "portals/venues/venuePricing.js");

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(verifyToken); // same guard the real server puts in front of /user/*
app.use("/customerapp/venues", customerVenueRouter);
app.use("/user/venue-bookings", websiteBookingRouter);
const server = http.createServer(app);
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const pool = await mysql.createPool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
const q = async (s, p) => (await pool.query(s, p))[0];
const [c1, c2] = await q("SELECT id, email, contact FROM guestUsers ORDER BY id LIMIT 2");
const cookieFor = (u) => "userToken=" + jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET);
const sign = (o, p) => crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(`${o}|${p}`).digest("hex");

const call = async (method, path, { cookie, body } = {}) => {
  const res = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: body && method !== "GET" ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};
let pass = 0, fail = 0;
const check = (n, c, x = "") => { (c ? pass++ : fail++); console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  " + x}`); };
const today = svc.todayIST();
const d = (n) => P.addDays(today, n);
const maxListing = (await q("SELECT COALESCE(MAX(id),0) m FROM venue_listings"))[0].m;
const pay = (order) => { const id = "pay_" + crypto.randomBytes(6).toString("hex"); payments.set(id, { id, order_id: order.order_id, amount: order.amount, currency: "INR", status: "captured" }); return id; };
const live = async (body) => { const l = await own.createListing({ role: "project", id: 785 }, body); await own.adminDecide(l.id, { action: "reject", reason: "x" }).catch(() => {}); await q("UPDATE venue_listings SET status='live' WHERE id=?", [l.id]); return l; };

try {
  const villa = await live({ title: "Lake View Villa", type: "villa", price_model: "night", base_price: 10000, cleaning_fee: 1000, capacity: 8, bedrooms: 3, city: "Nagpur", deposit_percent: 30, images: ["https://x.test/a.jpg"], cancellation_policy: "moderate" });
  const hall = await live({ title: "Grand Hall", type: "hall", price_model: "slot", base_price: 50000, capacity: 300, city: "Nagpur", images: ["https://x.test/h.jpg"] });
  const stay = { start_date: d(20), end_date: d(22), guests: 4 };

  console.log("== 1. browsing is public");
  let r = await call("GET", `/customerapp/venues/${villa.id}`);
  check("venue details, no login", r.status === 200 && r.data.listing?.title === "Lake View Villa");
  r = await call("POST", `/customerapp/venues/${villa.id}/quote`, { body: stay });
  check("quote, no login", r.status === 200 && r.data.quote?.total_amount > 0, JSON.stringify(r.data));
  const quote = r.data.quote;
  check("quote: 2 nights + cleaning + GST, 30% deposit", quote.stay_total === 20000 && quote.cleaning_fee === 1000 && quote.payable_now === Math.ceil(quote.total_amount * 0.3), JSON.stringify(quote));
  r = await call("GET", `/customerapp/venues/${villa.id}/availability?from=${today}&to=${d(60)}`);
  check("availability, no login", r.status === 200 && Array.isArray(r.data.booked));

  console.log("== 2. booking needs the website login");
  for (const [m, p] of [["GET", ""], ["POST", ""], ["POST", "/verify"], ["POST", "/1/cancel"]]) {
    r = await call(m, "/user/venue-bookings" + p, { body: { listing_id: villa.id, ...stay } });
    check(`${m} /user/venue-bookings${p} without a cookie -> 401`, r.status === 401);
  }
  r = await call("GET", "/user/venue-bookings", { cookie: "userToken=" + jwt.sign({ id: 999999, email: "ghost@test.com" }, process.env.JWT_SECRET) });
  check("valid token for a user that does not exist -> 401", r.status === 401);
  r = await call("GET", "/user/venue-bookings", { cookie: "userToken=garbage" });
  check("garbage token -> 401", r.status === 401);

  console.log("== 3. book and pay");
  r = await call("POST", "/user/venue-bookings", { cookie: cookieFor(c1), body: { listing_id: villa.id, ...stay } });
  check("hold + payment order created", r.status === 200 && r.data.order_id && r.data.amount === quote.payable_now * 100, JSON.stringify(r.data));
  const order = r.data;
  r = await call("GET", "/user/venue-bookings", { cookie: cookieFor(c1) });
  check("my bookings shows it awaiting payment, cancellable, no refund", r.data.bookings?.[0]?.status === "held" && r.data.bookings[0].can_cancel === true && r.data.bookings[0].cancel_refund_amount === 0, JSON.stringify(r.data.bookings?.[0]));
  const payId = pay(order);
  r = await call("POST", "/user/venue-bookings/verify", { cookie: cookieFor(c1), body: { razorpay_order_id: order.order_id, razorpay_payment_id: payId, razorpay_signature: "bad" } });
  check("wrong payment signature rejected", r.status === 400);
  r = await call("POST", "/user/venue-bookings/verify", { cookie: cookieFor(c2), body: { razorpay_order_id: order.order_id, razorpay_payment_id: payId, razorpay_signature: sign(order.order_id, payId) } });
  check("another customer cannot confirm my payment", r.status === 403);
  r = await call("POST", "/user/venue-bookings/verify", { cookie: cookieFor(c1), body: { razorpay_order_id: order.order_id, razorpay_payment_id: payId, razorpay_signature: sign(order.order_id, payId) } });
  check("payment verified -> confirmed", r.status === 200 && r.data.booking?.status === "confirmed", JSON.stringify(r.data));

  console.log("== 4. my bookings");
  r = await call("GET", "/user/venue-bookings", { cookie: cookieFor(c1) });
  const mine = r.data.bookings?.[0];
  check("listed with venue name, confirmed, paid", mine?.listing_title === "Lake View Villa" && mine.status === "confirmed" && Number(mine.amount_paid) === quote.payable_now, JSON.stringify(mine));
  check("20 days out (moderate): cancel preview is a full refund", mine?.can_cancel && mine.cancel_refund_percent === 100 && Number(mine.cancel_refund_amount) === quote.payable_now);
  r = await call("GET", "/user/venue-bookings", { cookie: cookieFor(c2) });
  check("another customer's list does not include it", (r.data.bookings || []).length === 0);
  r = await call("GET", `/customerapp/venues/${villa.id}/availability?from=${today}&to=${d(60)}`);
  check("dates now show as booked", r.data.booked?.some((b) => b.start === d(20)));
  r = await call("POST", "/user/venue-bookings", { cookie: cookieFor(c2), body: { listing_id: villa.id, ...stay } });
  check("second customer booking the same dates -> 409", r.status === 409, JSON.stringify(r.data));

  console.log("== 5. cancel");
  r = await call("POST", `/user/venue-bookings/${mine.id}/cancel`, { cookie: cookieFor(c2), body: {} });
  check("another customer cannot cancel it -> 403", r.status === 403);
  r = await call("POST", `/user/venue-bookings/${mine.id}/cancel`, { cookie: cookieFor(c1), body: { reason: "plans changed" } });
  check("owner cancels: full refund initiated", r.status === 200 && r.data.refund_amount === quote.payable_now && r.data.refund_status === "initiated", JSON.stringify(r.data));
  check("the refund went to Razorpay for the right payment and amount", refunds.length === 1 && refunds[0].payment_id === payId && refunds[0].amount === quote.payable_now * 100, JSON.stringify(refunds));
  r = await call("GET", "/user/venue-bookings", { cookie: cookieFor(c1) });
  check("list shows cancelled, no longer cancellable, refund recorded", r.data.bookings[0].status === "cancelled" && r.data.bookings[0].can_cancel === false && Number(r.data.bookings[0].refund_amount) === quote.payable_now, JSON.stringify(r.data.bookings[0]));
  r = await call("POST", `/user/venue-bookings/${mine.id}/cancel`, { cookie: cookieFor(c1), body: {} });
  check("cancelling twice -> 409", r.status === 409);
  r = await call("POST", "/user/venue-bookings", { cookie: cookieFor(c2), body: { listing_id: villa.id, ...stay } });
  check("freed dates can be booked by someone else", r.status === 200, JSON.stringify(r.data));

  console.log("== 6. unpaid hold can be cancelled with no refund");
  const before = refunds.length;
  r = await call("GET", "/user/venue-bookings", { cookie: cookieFor(c2) });
  const held = r.data.bookings.find((b) => b.status === "held");
  r = await call("POST", `/user/venue-bookings/${held.id}/cancel`, { cookie: cookieFor(c2), body: {} });
  check("hold cancelled, nothing refunded", r.status === 200 && r.data.refund_amount === 0 && refunds.length === before, JSON.stringify(r.data));

  console.log("== 7. slot venue (hall)");
  const slotStay = { start_date: d(10), slot: "morning", guests: 100 };
  r = await call("POST", "/user/venue-bookings", { cookie: cookieFor(c1), body: { listing_id: hall.id, ...slotStay } });
  check("morning slot held at 60% of the day price + 18% GST", r.status === 200 && r.data.amount === 30000 * 1.18 * 100, JSON.stringify(r.data).slice(0, 200));
  r = await call("POST", "/user/venue-bookings", { cookie: cookieFor(c2), body: { listing_id: hall.id, ...slotStay, slot: "full" } });
  check("full day clashes with the held morning slot -> 409", r.status === 409);
  r = await call("POST", "/user/venue-bookings", { cookie: cookieFor(c2), body: { listing_id: hall.id, ...slotStay, slot: "evening" } });
  check("evening slot is still free", r.status === 200);

  console.log("== 8. bad input");
  r = await call("POST", "/user/venue-bookings", { cookie: cookieFor(c1), body: { ...stay } });
  check("no listing_id -> 400", r.status === 400);
  r = await call("POST", "/user/venue-bookings", { cookie: cookieFor(c1), body: { listing_id: villa.id, start_date: d(-3), end_date: d(-1), guests: 2 } });
  check("dates in the past -> 400", r.status === 400);
  r = await call("POST", "/user/venue-bookings", { cookie: cookieFor(c1), body: { listing_id: villa.id, ...stay, guests: 99 } });
  check("more guests than capacity -> 400", r.status === 400);
  r = await call("POST", "/user/venue-bookings", { cookie: cookieFor(c1), body: { listing_id: 99999, ...stay } });
  check("unknown venue -> 404", r.status === 404);
} catch (e) {
  fail++;
  console.log("  ERROR  " + (e?.stack || e));
} finally {
  await q("DELETE FROM venue_bookings WHERE listing_id > ?", [maxListing]);
  await q("DELETE FROM venue_blocked_dates WHERE listing_id > ?", [maxListing]);
  await q("DELETE FROM venue_listings WHERE id > ?", [maxListing]);
  server.close();
  await pool.end();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
