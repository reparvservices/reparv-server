// Paid listings end to end: REAL add / list / approve / payment handlers + FAKE Razorpay + LOCAL throwaway MySQL.
// Needs a local MySQL with the real `properties` structure plus migrations/2026-11-22_listing_fees.sql.
//   DB_HOST=127.0.0.1 DB_PORT=3399 DB_USER=root DB_PASSWORD= DB_NAME=lf_test \
//   node tests/manual/listing-fees.mjs
import crypto from "node:crypto";
import http from "node:http";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import mysql from "mysql2/promise";

if (!["127.0.0.1", "localhost"].includes(process.env.DB_HOST)) {
  console.error("Refusing to run: DB_HOST is not local (" + process.env.DB_HOST + ")");
  process.exit(1);
}
process.env.JWT_SECRET = "lf-local-secret";
process.env.RAZORPAY_KEY_ID = "rzp_test_fake";
process.env.RAZORPAY_KEY_SECRET = "fake_secret_for_lf";

const orders = new Map(), payments = new Map(), refunds = [];
const fakeRazorpay = {
  orders: {
    create: async (o) => { const id = "order_" + crypto.randomBytes(6).toString("hex"); orders.set(id, { id, ...o }); return orders.get(id); },
    fetch: async (id) => orders.get(id),
  },
  payments: {
    fetch: async (id) => ({ ...payments.get(id) }),
    capture: async (id) => { payments.get(id).status = "captured"; return { ...payments.get(id) }; },
    refund: async (id, body) => { refunds.push({ id, ...body }); return { id: "rfnd_x" }; },
  },
};

const root = new URL("../../src/", import.meta.url).pathname;
const venueSvc = await import(root + "portals/venues/venueService.js");
venueSvc.__setRazorpayForTests(fakeRazorpay);
const fees = await import(root + "portals/listingFees/listingFeeService.js");
const { verifyToken } = await import(root + "core/middleware/verifyToken.js");
const { userListingFeeRouter, adminListingFeeRouter } = await import(root + "portals/listingFees/listingFeeRoutes.js");
const userPropertyRoutes = (await import(root + "portals/user/routes/propertyRoutes.js")).default;
const adminPropertyRoutes = (await import(root + "portals/admin/routes/propertyRoutes.js")).default;

const app = express();
app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());
app.use(verifyToken); // the same guard the real server puts in front of everything
app.use("/user/properties", userPropertyRoutes);
app.use("/user/listing-fees", userListingFeeRouter);
app.use("/admin/listing-fees", adminListingFeeRouter);
app.use("/admin/properties", adminPropertyRoutes);
const server = http.createServer(app);
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const pool = mysql.createPool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
const q = async (s, p) => (await pool.query(s, p))[0];
const users = await q("SELECT id, email FROM guestUsers ORDER BY id LIMIT 3");
const [asha, ravi, meera] = users;
const cookieOf = (u) => "userToken=" + jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET);
const adminCookie = "adminToken=" + jwt.sign({ id: 1, role: "admin" }, process.env.JWT_SECRET);

const call = async (method, path, { cookie, body } = {}) => {
  const res = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: body && method !== "GET" ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};
let pass = 0, fail = 0;
const check = (n, c, x = "") => { (c ? pass++ : fail++); console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  -> " + x}`); };

let seq = 0;
const listing = (over = {}) => ({
  propertyCategory: "NewFlat", listingType: "Sell", propertyName: `Fee Test Home ${Date.now()}-${++seq}`,
  state: "Maharashtra", city: "Nagpur", contact: "9876543210", address: "Civil Lines", pincode: "440001",
  latitude: 21.14, longitude: 79.08, totalOfferPrice: 4500000, builtUpArea: "1200", frontView: ["https://x.test/a.jpg"], ...over,
});
const add = (u, over) => call("POST", "/user/properties/add", { cookie: cookieOf(u), body: listing(over) });
const row = async (id) => (await q("SELECT propertyid, fee_status, approve FROM properties WHERE propertyid = ?", [id]))[0];
const ledger = async (userId) => q("SELECT kind, status, base_amount, gst_amount, total_amount FROM listing_fee_payments WHERE user_id = ? ORDER BY id", [userId]);
const pay = (order, over = {}) => {
  const id = "pay_" + crypto.randomBytes(6).toString("hex");
  payments.set(id, { id, order_id: order.order_id, amount: order.amount, currency: "INR", status: "captured", ...over });
  const sig = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(`${order.order_id}|${id}`).digest("hex");
  return { razorpay_order_id: order.order_id, razorpay_payment_id: id, razorpay_signature: sig };
};
const adminList = async () => (await call("GET", "/admin/properties/get/Guest%20User", { cookie: adminCookie })).data;

// Start from a clean throwaway database every run (this script refuses to run on a non-local DB)
await q("DELETE FROM listing_fee_payments");
await q("DELETE FROM listing_fee_rules");
await q("DELETE FROM subscription_payment_claims");
await q("DELETE FROM properties");
await q("UPDATE listing_fee_settings SET enabled = 0, free_per_user = 1, default_fee = 0, go_live_at = NULL WHERE id = 1");

const created = [];
try {
  console.log("== 1. feature OFF: nothing changes");
  let r = await add(asha);
  created.push(r.data.id);
  check("listing saved as before, no payment asked", r.status === 201 && r.data.payment_required === false, JSON.stringify(r.data));
  check("no fee status, no ledger row", (await row(r.data.id)).fee_status === null && (await ledger(asha.id)).length === 0);
  r = await call("GET", "/user/listing-fees/quote?listingType=Sell&category=NewFlat", { cookie: cookieOf(asha) });
  check("quote says the feature is off", r.status === 200 && r.data.quote.enabled === false && r.data.quote.payment_required === false, JSON.stringify(r.data));

  console.log("== 2. admin sets it up");
  r = await call("GET", "/admin/listing-fees");
  check("admin API needs an admin login", r.status === 401, String(r.status));
  r = await call("PUT", "/admin/listing-fees/settings", { cookie: adminCookie, body: { enabled: true, free_per_user: -1, default_fee: 0 } });
  check("a negative free allowance is rejected", r.status === 400 && /Free listings/.test(r.data.message), JSON.stringify(r.data));
  r = await call("PUT", "/admin/listing-fees/settings", { cookie: adminCookie, body: { enabled: true, free_per_user: 1, default_fee: 200 } });
  const goLive = r.data.settings?.go_live_at;
  check("switched on: start date is set", r.status === 200 && r.data.settings.enabled === 1 && !!goLive, JSON.stringify(r.data));
  r = await call("POST", "/admin/listing-fees/rules", { cookie: adminCookie, body: { listing_type: "Any", property_category: "NewFlat", amount: 500 } });
  check("fee rule: NewFlat 500", r.status === 200 && r.data.rules.some((x) => x.property_category === "NewFlat" && x.amount === 500));
  await call("POST", "/admin/listing-fees/rules", { cookie: adminCookie, body: { listing_type: "Rent", property_category: "NewFlat", amount: 300 } });
  await call("POST", "/admin/listing-fees/rules", { cookie: adminCookie, body: { listing_type: "Any", property_category: "Plot", amount: 0 } });
  r = await call("POST", "/admin/listing-fees/rules", { cookie: adminCookie, body: { listing_type: "Any", property_category: "X", amount: -5 } });
  check("a bad fee is rejected", r.status === 400);
  await call("PUT", "/admin/listing-fees/settings", { cookie: adminCookie, body: { enabled: false, free_per_user: 1, default_fee: 200 } });
  r = await call("PUT", "/admin/listing-fees/settings", { cookie: adminCookie, body: { enabled: true, free_per_user: 1, default_fee: 200 } });
  check("switching off and on again keeps the original start date", String(r.data.settings.go_live_at) === String(goLive));

  console.log("== 3. first listing free, second needs payment");
  r = await call("GET", "/user/listing-fees/quote?listingType=Sell&category=NewFlat", { cookie: cookieOf(ravi) });
  check("a new user's quote: first listing is free", r.data.quote.mode === "free" && r.data.quote.free_left === 1, JSON.stringify(r.data));
  r = await add(ravi);
  const ravi1 = r.data.id; created.push(ravi1);
  check("Ravi's first listing is free", r.status === 201 && r.data.payment_required === false && (await row(ravi1)).fee_status === "free", JSON.stringify(r.data));
  r = await add(ravi);
  const ravi2 = r.data.id; created.push(ravi2);
  check("his second listing asks for payment: 500 + 18% GST = 590", r.status === 201 && r.data.payment_required === true && r.data.fee.total === 590 && r.data.fee.gst === 90, JSON.stringify(r.data));
  check("it is saved as pending, not approved", (await row(ravi2)).fee_status === "pending" && (await row(ravi2)).approve === "Not Approved");
  r = await add(ravi, { listingType: "Rent" });
  const ravi3 = r.data.id; created.push(ravi3);
  check("a Rent listing of the same type costs 300 + GST = 354", r.data.payment_required === true && r.data.fee.total === 354, JSON.stringify(r.data.fee));
  r = await add(ravi, { propertyCategory: "Plot" });
  created.push(r.data.id);
  check("a type set to 0 is not charged", r.status === 201 && r.data.payment_required === false && (await row(r.data.id)).fee_status === "free", JSON.stringify(r.data));
  r = await add(meera);
  created.push(r.data.id);
  check("another user still gets their own free listing", r.data.payment_required === false);

  console.log("== 4. unpaid listings stay hidden");
  let list = await adminList();
  check("admin list does not show unpaid listings", !list.some((p) => p.propertyid === ravi2 || p.propertyid === ravi3), JSON.stringify(list.map((p) => p.propertyid)));
  check("…but shows the free ones", list.some((p) => p.propertyid === ravi1));
  r = await call("PUT", `/admin/properties/approve/${ravi2}`, { cookie: adminCookie });
  check("admin cannot approve an unpaid listing", r.status === 409 && /fee/i.test(r.data.message), JSON.stringify(r.data));
  check("still not approved", (await row(ravi2)).approve === "Not Approved");

  console.log("== 5. pay");
  r = await call("POST", "/user/listing-fees/checkout", { cookie: cookieOf(meera), body: { property_id: ravi2 } });
  check("someone else cannot pay for my listing", r.status === 403, JSON.stringify(r.data));
  r = await call("POST", "/user/listing-fees/checkout", { cookie: cookieOf(ravi), body: { property_id: ravi1 } });
  check("a free listing has nothing to pay", r.status === 409, JSON.stringify(r.data));
  r = await call("POST", "/user/listing-fees/checkout", { body: { property_id: ravi2 } });
  check("payment needs the website login", r.status === 401);
  r = await call("POST", "/user/listing-fees/checkout", { cookie: cookieOf(ravi), body: { property_id: ravi2 } });
  const order = r.data;
  check("order for the server's amount (₹590 = 59000 paise)", r.status === 200 && order.amount === 59000, JSON.stringify(r.data));
  let proof = pay(order);
  r = await call("POST", "/user/listing-fees/verify", { cookie: cookieOf(ravi), body: { ...proof, razorpay_signature: "bad" } });
  check("a wrong signature is rejected", r.status === 400);
  r = await call("POST", "/user/listing-fees/verify", { cookie: cookieOf(meera), body: proof });
  check("another user cannot confirm my payment", r.status === 403, JSON.stringify(r.data));
  const cheap = pay(order, { amount: 100 });
  r = await call("POST", "/user/listing-fees/verify", { cookie: cookieOf(ravi), body: cheap });
  check("a payment of a smaller amount is rejected", r.status === 400 && /amount/i.test(r.data.message), JSON.stringify(r.data));
  check("still pending after the bad attempts", (await row(ravi2)).fee_status === "pending");
  r = await call("POST", "/user/listing-fees/verify", { cookie: cookieOf(ravi), body: proof });
  check("the real payment confirms the listing", r.status === 200 && r.data.fee_status === "paid", JSON.stringify(r.data));
  r = await call("POST", "/user/listing-fees/verify", { cookie: cookieOf(ravi), body: proof });
  check("confirming again is harmless", r.status === 200 && r.data.already === true, JSON.stringify(r.data));
  check("listing is paid, ledger shows the payment", (await row(ravi2)).fee_status === "paid" && (await ledger(ravi.id)).some((l) => l.kind === "paid" && l.status === "paid" && l.total_amount === 590));
  list = await adminList();
  check("now it appears in the admin list", list.some((p) => p.propertyid === ravi2));
  r = await call("PUT", `/admin/properties/approve/${ravi2}`, { cookie: adminCookie });
  check("admin can approve it", r.status === 200 && (await row(ravi2)).approve === "Approved", JSON.stringify(r.data));
  r = await call("GET", "/admin/listing-fees/payments", { cookie: adminCookie });
  check("admin sees the payment", r.data.payments.some((p) => p.property_id === ravi2 && p.total_amount === 590 && p.status === "paid"), JSON.stringify(r.data).slice(0, 200));

  console.log("== 6. paying through the webhook when the browser never came back");
  r = await call("POST", "/user/listing-fees/checkout", { cookie: cookieOf(ravi), body: { property_id: ravi3 } });
  proof = pay(r.data);
  const hook = await fees.handleListingFeeOrderPaidWebhook({ payment: { entity: { id: proof.razorpay_payment_id, order_id: proof.razorpay_order_id } } });
  check("webhook confirms the listing", hook.handled === true && hook.ok === true && (await row(ravi3)).fee_status === "paid", JSON.stringify(hook));
  const hook2 = await fees.handleListingFeeOrderPaidWebhook({ payment: { entity: { id: proof.razorpay_payment_id, order_id: proof.razorpay_order_id } } });
  check("a repeated webhook is harmless", hook2.handled === true);
  const other = await fees.handleListingFeeOrderPaidWebhook({ payment: { entity: { id: "pay_x", order_id: "order_unknown_to_us" } } }).catch(() => ({ handled: false }));
  check("a webhook for some other order is ignored", other.handled === false);

  console.log("== 7. cannot get a second free listing by deleting the first");
  // (the real delete handler also removes photos from S3, which this isolated run has no bucket for)
  await q("DELETE FROM properties WHERE propertyid = ?", [ravi1]);
  check("Ravi's free listing is gone", (await q("SELECT COUNT(*) n FROM properties WHERE propertyid = ?", [ravi1]))[0].n === 0);
  r = await add(ravi);
  created.push(r.data.id);
  check("his next listing is still charged", r.data.payment_required === true, JSON.stringify(r.data));

  console.log("== 8. two listings at the same moment, one free allowance");
  const burst = await Promise.all([1, 2, 3, 4, 5, 6].map(() => add({ id: users[2].id, email: users[2].email }, { propertyCategory: "Plot", listingType: "Rent" }).then(() => add({ id: asha.id, email: asha.email }))));
  // Asha (feature was off for her first listing, so she still has her free one) fires 6 adds at once:
  const ashaNow = await q("SELECT fee_status, COUNT(*) n FROM properties WHERE guestUserId = ? AND fee_status IS NOT NULL GROUP BY fee_status", [asha.id]);
  const freeCount = Number(ashaNow.find((x) => x.fee_status === "free")?.n || 0);
  const pendingCount = Number(ashaNow.find((x) => x.fee_status === "pending")?.n || 0);
  check("exactly 1 of 6 simultaneous listings was free", freeCount === 1 && pendingCount === 5, JSON.stringify(ashaNow));
  check("ledger agrees: one free use", (await ledger(asha.id)).filter((l) => l.kind === "free").length === 1);
  burst.forEach((b) => b?.data?.id && created.push(b.data.id));

  console.log("== 9. editing never charges again");
  const [paid] = await q("SELECT propertyid FROM properties WHERE fee_status = 'paid' AND guestUserId = ? LIMIT 1", [ravi.id]);
  r = await call("PUT", `/user/properties/edit/${paid.propertyid}`, { cookie: cookieOf(ravi), body: listing({ propertyName: `Renamed ${Date.now()}`, propertyDescription: "better" }) });
  check("editing a paid listing succeeds", r.status === 200, JSON.stringify(r.data));
  check("…and it stays paid", (await row(paid.propertyid)).fee_status === "paid");
  check("…with no new ledger row", (await q("SELECT COUNT(*) n FROM listing_fee_payments WHERE property_id = ?", [paid.propertyid]))[0].n === 1);
} catch (e) {
  fail++;
  console.log("  ERROR  " + (e?.stack || e));
} finally {
  await pool.end();
  server.close();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
