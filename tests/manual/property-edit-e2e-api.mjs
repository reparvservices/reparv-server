// Isolated API for BROWSER tests of editing properties from all three panels: REAL user/admin handlers + FAKE Razorpay + stand-in S3
// + LOCAL throwaway MySQL. Never run against the shared .env database.
//   DB_HOST=127.0.0.1 DB_PORT=3399 DB_USER=root DB_PASSWORD= DB_NAME=lf_test \
//   node tests/manual/listing-fees-e2e-api.mjs        (listens on :3010)
import crypto from "node:crypto";
import http from "node:http";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import mysql from "mysql2/promise";

if (!["127.0.0.1", "localhost"].includes(process.env.DB_HOST)) {
  console.error("Refusing to run: DB_HOST is not local (" + process.env.DB_HOST + ")");
  process.exit(1);
}
process.env.JWT_SECRET = "lf-e2e-secret";
process.env.RAZORPAY_KEY_ID = "rzp_test_fake";
process.env.RAZORPAY_KEY_SECRET = "fake_secret_for_lf";

const orders = new Map();
const payments = new Map();
const fakeRazorpay = {
  orders: {
    create: async (o) => { const id = "order_" + crypto.randomBytes(6).toString("hex"); orders.set(id, { id, ...o }); return orders.get(id); },
    fetch: async (id) => orders.get(id),
  },
  payments: {
    fetch: async (id) => ({ ...payments.get(id) }),
    capture: async (id) => { payments.get(id).status = "captured"; return { ...payments.get(id) }; },
  },
};

const root = new URL("../../src/", import.meta.url).pathname;
(await import(root + "portals/venues/venueService.js")).__setRazorpayForTests(fakeRazorpay);
const { verifyToken } = await import(root + "core/middleware/verifyToken.js");
const { requireAdminAccess } = await import(root + "core/middleware/adminAccess.js");
const { userListingFeeRouter, adminListingFeeRouter } = await import(root + "portals/listingFees/listingFeeRoutes.js");
const userPropertyRoutes = (await import(root + "portals/user/routes/propertyRoutes.js")).default;
const guestPropertyRoutes = (await import(root + "portals/guestUser/routes/propertyRoutes.js")).default;
const partnerPropertyRoutes = (await import(root + "portals/projectPartner/routes/propertyRoutes.js")).default;
const adminPropertyRoutes = (await import(root + "portals/admin/routes/propertyRoutes.js")).default;

const pool = mysql.createPool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });

const app = express();
app.use(cors({ origin: ["http://localhost:3011", "http://localhost:5180", "http://localhost:5181"], credentials: true }));
app.use(express.json({ limit: "5mb" }));
app.use(express.raw({ type: "image/*", limit: "5mb" }));
app.use(cookieParser());

// ---- test-only helpers (not part of the product) ----
const API = "http://localhost:3010";
app.get("/__test/cookie/:userId", async (req, res) => {
  const [rows] = await pool.query("SELECT id, email FROM guestUsers WHERE id = ?", [req.params.userId]);
  res.json({ token: jwt.sign({ id: rows[0].id, email: rows[0].email }, process.env.JWT_SECRET) });
});
app.get("/__test/admin-cookie", (_req, res) => res.json({ token: jwt.sign({ id: 1, username: "admin", name: "Test Admin", role: "admin" }, process.env.JWT_SECRET) }));
app.post("/__test/pay", (req, res) => {
  const order = orders.get(req.body.order_id);
  if (!order) return res.status(404).json({ message: "unknown order" });
  const payment_id = "pay_" + crypto.randomBytes(6).toString("hex");
  payments.set(payment_id, { id: payment_id, order_id: order.id, amount: order.amount, currency: "INR", status: "captured" });
  const signature = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(`${order.id}|${payment_id}`).digest("hex");
  res.json({ razorpay_order_id: order.id, razorpay_payment_id: payment_id, razorpay_signature: signature });
});
app.get("/__test/state", async (_req, res) => {
  const [settings] = await pool.query("SELECT enabled, free_per_user, default_fee, go_live_at FROM listing_fee_settings WHERE id = 1");
  const [rules] = await pool.query("SELECT listing_type, property_category, amount FROM listing_fee_rules ORDER BY id");
  const [props] = await pool.query("SELECT propertyid, guestUserId, propertyName, propertyCategory, listingType, fee_status, approve FROM properties ORDER BY propertyid");
  const [ledger] = await pool.query("SELECT user_id, property_id, kind, status, base_amount, gst_amount, total_amount FROM listing_fee_payments ORDER BY id");
  res.json({ settings: settings[0], rules, props, ledger });
});
app.post("/__test/reset", async (_req, res) => {
  await pool.query("DELETE FROM listing_fee_payments");
  await pool.query("DELETE FROM listing_fee_rules");
  await pool.query("DELETE FROM subscription_payment_claims");
  await pool.query("DELETE FROM properties");
  await pool.query("UPDATE listing_fee_settings SET enabled = 0, free_per_user = 1, default_fee = 0, go_live_at = NULL WHERE id = 1");
  res.json({ ok: true });
});
app.get("/__test/ping", (_req, res) => res.json({ ok: true }));
// stand-in for S3 so photo uploads work in the browser
app.post("/api/s3/signed-url/get", (req, res) => {
  const key = `${Date.now()}-${String(req.body.fileName || "photo.png").replace(/[^A-Za-z0-9._-]+/g, "-")}`;
  res.json({ uploadUrl: `${API}/__test/s3put/${key}`, fileUrl: `${API}/__test/s3get/${key}` });
});
app.put("/__test/s3put/:key", (_req, res) => res.status(200).end());
app.get("/__test/s3get/:key", (_req, res) => res.status(404).end());

// lookups the forms call (public in the real server too)
app.get("/admin/states", (_req, res) => res.json([{ state: "Maharashtra" }, { state: "Gujarat" }]));
app.get("/admin/cities/:state", (req, res) => res.json(req.params.state === "Gujarat" ? [{ city: "Surat" }] : [{ city: "Nagpur" }, { city: "Pune" }]));
app.get("/admin/projectpartner/active", (_req, res) => res.json([{ id: 785, fullname: "Partner A", status: "Active", contact: "9000000002" }]));
app.get("/__test/partner-cookie", (_req, res) => res.json({ token: jwt.sign({ id: 785, role: "Project Partner", fullname: "Partner A", contact: "9000000002", email: "pa@test.com" }, process.env.JWT_SECRET) }));
app.get("/__test/row/:id", async (req, res) => {
  const [r] = await pool.query("SELECT *, DATE_FORMAT(possessionDate,'%Y-%m-%d') AS possessionDate FROM properties WHERE propertyid = ?", [req.params.id]);
  res.json(r[0] || null);
});
app.post("/__test/create", async (req, res) => {
  // create a property for a panel through the REAL add route of that panel
  const { panel, body } = req.body;
  const target = { admin: ["/admin/properties/v2/add", { ...body, projectpartnerid: 785 }, "adminToken"], partner: ["/project-partner/properties/v2/add", body, "projectPartnerToken"], website: ["/user/properties/add", body, "userToken"] }[panel];
  const tokens = { adminToken: jwt.sign({ id: 1, username: "admin", role: "admin" }, process.env.JWT_SECRET), projectPartnerToken: jwt.sign({ id: 785 }, process.env.JWT_SECRET), userToken: jwt.sign({ id: 1, email: "asha@test.com" }, process.env.JWT_SECRET) };
  const r = await fetch(`http://localhost:3010${target[0]}`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: `${target[2]}=${tokens[target[2]]}` }, body: JSON.stringify(target[1]) });
  res.status(r.status).json(await r.json());
});

app.use(verifyToken); // the same guard the real server puts in front of everything
app.use(requireAdminAccess); // and the admin role check, exactly like src/app.js
app.get("/admin/auth/me", (req, res) => {
  try {
    const d = jwt.verify(req.cookies.adminToken, process.env.JWT_SECRET);
    res.json({ user: { id: d.id, username: d.username, name: d.name, role: d.role } });
  } catch {
    res.status(401).json({ message: "Not authenticated" });
  }
});
app.use("/user/properties", userPropertyRoutes);
app.use("/guest-user/properties", guestPropertyRoutes);
app.use("/project-partner/properties", partnerPropertyRoutes);
app.get("/project-partner/session-data", (req, res) => { try { const d = jwt.verify(req.cookies.projectPartnerToken, process.env.JWT_SECRET); res.json({ user: { id: d.id, role: "Project Partner", fullname: d.fullname, contact: d.contact, email: d.email } }); } catch { res.status(401).json({ message: "no session" }); } });
app.get("/user/profile", (_req, res) => res.json({}));
app.get("/project-partner/subscription/user/:id", (req, res) => res.json({ active: true, all_features: true, features: [], plan_name: "Test Plan", status: "active" }));
app.use("/user/listing-fees", userListingFeeRouter);
app.use("/admin/listing-fees", adminListingFeeRouter);
app.use("/admin/properties", adminPropertyRoutes);
app.use((req, res) => res.status(404).json({ message: "not in the e2e API" }));

http.createServer(app).listen(3010, () => console.log("property-edit e2e API on http://localhost:3010"));
