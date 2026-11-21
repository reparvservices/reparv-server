// Isolated API for browser tests of website venue booking: REAL venue routes + REAL login check
// + FAKE Razorpay + LOCAL throwaway MySQL. Never run against the shared .env database.
//   DB_HOST=127.0.0.1 DB_PORT=3399 DB_USER=root DB_PASSWORD= DB_NAME=venue_test \
//   node tests/manual/booking-e2e-api.mjs            (listens on :3010)
import crypto from "node:crypto";
import http from "node:http";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";

if (!["127.0.0.1", "localhost"].includes(process.env.DB_HOST)) {
  console.error("Refusing to run: DB_HOST is not local (" + process.env.DB_HOST + ")");
  process.exit(1);
}
process.env.JWT_SECRET = "e2e-local-secret";
process.env.RAZORPAY_KEY_ID = "rzp_test_fake";
process.env.RAZORPAY_KEY_SECRET = "fake_secret_for_e2e";

const orders = new Map();
const payments = new Map();
const refunds = [];
const fakeRazorpay = {
  orders: {
    create: async (o) => {
      const id = "order_" + crypto.randomBytes(6).toString("hex");
      orders.set(id, { id, ...o });
      return orders.get(id);
    },
    fetch: async (id) => orders.get(id),
  },
  payments: {
    fetch: async (id) => ({ ...payments.get(id) }),
    capture: async (id) => {
      payments.get(id).status = "captured";
      return { ...payments.get(id) };
    },
    refund: async (id, body) => {
      const r = { id: "rfnd_" + crypto.randomBytes(4).toString("hex"), payment_id: id, ...body };
      refunds.push(r);
      return r;
    },
  },
};

const root = new URL("../../src/", import.meta.url).pathname;
const svc = await import(root + "portals/venues/venueService.js");
svc.__setRazorpayForTests(fakeRazorpay);
const { verifyToken } = await import(root + "core/middleware/verifyToken.js");
const { customerVenueRouter, websiteBookingRouter } = await import(root + "portals/venues/venueRoutes.js");
const own = await import(root + "portals/venues/venueOwnerService.js");
const mysql = (await import("mysql2/promise")).default;
const pool = mysql.createPool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });

// Seed one live villa that is priced per day (like the "tes" venue) unless it already exists
const [existing] = await pool.query("SELECT id FROM venue_listings WHERE title = 'Lake View Villa' LIMIT 1");
let villaId = existing[0]?.id;
if (!villaId) {
  const v = await own.createListing(
    { role: "project", id: 785 },
    { title: "Lake View Villa", type: "villa", price_model: "slot", base_price: 10000, weekend_price: 15000, cleaning_fee: 1000, capacity: 8, bedrooms: 3, city: "Nagpur", state: "Maharashtra", address: "Lake Road", description: "A quiet villa by the lake.", deposit_percent: 100, images: ["https://picsum.photos/seed/villa/800/500"], cancellation_policy: "moderate" },
  );
  await pool.query("UPDATE venue_listings SET status = 'live' WHERE id = ?", [v.id]);
  villaId = v.id;
}

const app = express();
app.use(cors({ origin: ["http://localhost:3011"], credentials: true }));
app.use(express.json());
app.use(cookieParser());

// ---- test-only helpers (not part of the product) ----
app.get("/__test/info", (_req, res) => res.json({ villaId }));
app.get("/__test/cookie/:userId", async (req, res) => {
  const [rows] = await pool.query("SELECT id, email, contact FROM guestUsers WHERE id = ?", [req.params.userId]);
  res.json({ token: jwt.sign({ id: rows[0].id, email: rows[0].email }, process.env.JWT_SECRET) });
});
// plays the part of the Razorpay popup: "the customer paid" -> a captured payment + a valid signature
app.post("/__test/pay", (req, res) => {
  const { order_id } = req.body;
  const order = orders.get(order_id);
  if (!order) return res.status(404).json({ message: "unknown order" });
  const payment_id = "pay_" + crypto.randomBytes(6).toString("hex");
  payments.set(payment_id, { id: payment_id, order_id, amount: order.amount, currency: "INR", status: "captured" });
  const signature = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(`${order_id}|${payment_id}`).digest("hex");
  res.json({ razorpay_order_id: order_id, razorpay_payment_id: payment_id, razorpay_signature: signature });
});
app.get("/__test/refunds", (_req, res) => res.json({ refunds }));
app.get("/__test/bookings", async (_req, res) => {
  const [rows] = await pool.query("SELECT id, status, DATE_FORMAT(start_date,'%Y-%m-%d') start_date, DATE_FORMAT(end_date,'%Y-%m-%d') end_date, slot, total_amount, amount_paid, refund_amount FROM venue_bookings ORDER BY id");
  res.json({ bookings: rows });
});
app.post("/__test/reset", async (_req, res) => {
  await pool.query("DELETE FROM venue_bookings");
  refunds.length = 0;
  res.json({ ok: true });
});

app.use(verifyToken); // same guard the real server puts in front of /user/*
app.use("/customerapp/venues", customerVenueRouter);
app.use("/user/venue-bookings", websiteBookingRouter);
app.use((req, res) => res.status(404).json({ message: "not in the e2e API" }));

http.createServer(app).listen(3010, () => console.log("e2e API on http://localhost:3010 (villa id " + villaId + ")"));
