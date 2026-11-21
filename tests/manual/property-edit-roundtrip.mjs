// Edit round trip for the three panels: create a property, change EVERY editable field, save,
// reload it the way the edit form does, and compare. REAL routes + handlers, LOCAL throwaway MySQL.
//   DB_HOST=127.0.0.1 DB_PORT=3399 DB_USER=root DB_PASSWORD= DB_NAME=lf_test \
//   node tests/manual/property-edit-roundtrip.mjs
process.env.TZ = "Asia/Kolkata";
import http from "node:http";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import mysql from "mysql2/promise";

if (!["127.0.0.1", "localhost"].includes(process.env.DB_HOST)) {
  console.error("Refusing to run: DB_HOST is not local (" + process.env.DB_HOST + ")");
  process.exit(1);
}
process.env.JWT_SECRET = "edit-local-secret";

const root = new URL("../../src/", import.meta.url).pathname;
const { verifyToken } = await import(root + "core/middleware/verifyToken.js");
const { requireAdminAccess } = await import(root + "core/middleware/adminAccess.js");
const { PROPERTY_TEXT_COLUMNS, PROPERTY_LIST_COLUMNS } = await import(root + "core/utils/propertyColumns.js");
const { LISTING_IMAGE_KEYS } = await import(root + "core/utils/propertyListing.js");
const adminRoutes = (await import(root + "portals/admin/routes/propertyRoutes.js")).default;
const partnerRoutes = (await import(root + "portals/projectPartner/routes/propertyRoutes.js")).default;
const userRoutes = (await import(root + "portals/user/routes/propertyRoutes.js")).default;
const guestRoutes = (await import(root + "portals/guestUser/routes/propertyRoutes.js")).default;

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
app.use(verifyToken);
app.use(requireAdminAccess);
app.use("/admin/properties", adminRoutes);
app.use("/project-partner/properties", partnerRoutes);
app.use("/user/properties", userRoutes);
app.use("/guest-user/properties", guestRoutes);
const server = http.createServer(app);
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
const pool = mysql.createPool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, dateStrings: true });
const q = async (s, p) => (await pool.query(s, p))[0];

const sign = (p) => jwt.sign(p, process.env.JWT_SECRET);
const call = async (method, path, cookie, body) => {
  const res = await fetch(base + path, { method, headers: { "Content-Type": "application/json", Cookie: cookie }, body: body && method !== "GET" ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};

// ---------------- the values ----------------
const ts = Date.now();
const FIRST = {
  propertyCategory: "NewFlat", listingType: "Sell", propertyKind: "Residential", state: "Maharashtra", city: "Nagpur",
  contact: "9876543210", address: "Old Address", pincode: "440001", latitude: 21.14, longitude: 79.08,
  totalOfferPrice: 4500000, builtUpArea: "1200", frontView: ["https://x.test/old-front.jpg"],
};
const EDITED_TEXT = {
  projectBy: "Edited Owner", contact: "9123456789", email: "edited@example.com",
  location: "Edited Locality", distanceFromCityCenter: "7", address: "99 Edited Road", pincode: "411001", latitude: 18.5204, longitude: 73.8567,
  totalSalesPrice: 6000000, totalOfferPrice: 5500000,
  stampDuty: "1.5", registrationFee: "30000", gst: "5", advocateFee: "12000", msebWater: "4000", maintenance: "2500", other: "999", tags: "edited,tag,list",
  possessionDate: "2027-03-15", builtYear: "2024", ownershipType: "Freehold", builtUpArea: "1500", carpetArea: "1300",
  parkingAvailability: "Yes", totalFloors: "12", floorNo: "7", loanAvailability: "Yes", propertyFacing: "East",
  reraRegistered: "Yes", furnishing: "Fully Furnished", waterSupply: "Municipal", powerBackup: "Full",
  sizeAreaFeature: "Spacious", parkingFeature: "Covered", terraceFeature: "Private terrace", ageOfPropertyFeature: "Under 5 years", propertyStatusFeature: "Ready to move",
  propertyDescription: "An edited description with new details.",
};
const EDITED_LISTS = Object.fromEntries(PROPERTY_LIST_COLUMNS.map((c) => [c, [`${c}-one`, `${c}-two`]]));
const EDITED_IMAGES = Object.fromEntries(LISTING_IMAGE_KEYS.map((k) => [k, [`https://x.test/edited-${k}.jpg`]]));
const EDITED_VIDEO = { videoLink: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", instagramReelLink: "https://www.instagram.com/reel/xyz/" };
const EDITED_CORE = { propertyCategory: "NewFlat", listingType: "Sell", propertyKind: "Residential", state: "Maharashtra", city: "Pune", propertyType: ["3 BHK"] };

const PANELS = {
  admin: {
    cookie: "adminToken=" + sign({ id: 1, username: "admin", role: "admin" }),
    add: (b) => call("POST", "/admin/properties/v2/add", PANELS.admin.cookie, { ...b, projectpartnerid: 785 }),
    edit: (id, b) => call("PUT", `/admin/properties/v2/edit/${id}`, PANELS.admin.cookie, b),
    load: (id) => call("GET", `/admin/properties/${id}`, PANELS.admin.cookie),
  },
  partner: {
    cookie: "projectPartnerToken=" + sign({ id: 785, freeProjectPartner: false }),
    add: (b) => call("POST", "/project-partner/properties/v2/add", PANELS.partner.cookie, b),
    edit: (id, b) => call("PUT", `/project-partner/properties/v2/edit/${id}`, PANELS.partner.cookie, b),
    load: (id) => call("GET", `/project-partner/properties/${id}`, PANELS.partner.cookie),
  },
  website: {
    cookie: "userToken=" + sign({ id: 1, email: "asha@test.com" }),
    add: (b) => call("POST", "/user/properties/add", PANELS.website.cookie, b),
    edit: (id, b) => call("PUT", `/user/properties/edit/${id}`, PANELS.website.cookie, b),
    load: (id) => call("GET", `/guest-user/properties/${id}`, PANELS.website.cookie),
  },
};

const norm = (v) => (v === null || v === undefined ? "" : String(v).trim());
const sameNumber = (a, b) => Number(a) === Number(b);
const parseList = (v) => {
  try { const p = typeof v === "string" ? JSON.parse(v) : v; return Array.isArray(p) ? p : []; } catch { return []; }
};

let pass = 0, fail = 0;
const problems = [];
const check = (name, ok, extra = "") => { (ok ? pass++ : fail++); if (!ok) problems.push(`${name}${extra ? "  -> " + extra : ""}`); };

for (const [panel, P] of Object.entries(PANELS)) {
  console.log(`\n== ${panel} panel`);
  const name = `Roundtrip ${panel} ${ts}`;
  const created = await P.add({ ...FIRST, propertyName: name });
  const id = created.data?.id;
  if (created.status !== 201 || !id) { console.log("  could not create:", created.status, JSON.stringify(created.data).slice(0, 200)); fail++; problems.push(`${panel}: create failed`); continue; }
  console.log(`  created #${id}`);

  const newName = name + " EDITED";
  const body = { ...EDITED_CORE, propertyName: newName, ...EDITED_TEXT, ...EDITED_LISTS, ...EDITED_IMAGES, ...EDITED_VIDEO };
  const saved = await P.edit(id, body);
  check(`${panel}: the edit is accepted`, saved.status === 200, `${saved.status} ${JSON.stringify(saved.data).slice(0, 200)}`);
  console.log(`  edit -> ${saved.status}`);

  // ---- what is stored ----
  const [row] = await q("SELECT *, DATE_FORMAT(possessionDate,'%Y-%m-%d') AS possessionDay FROM properties WHERE propertyid = ?", [id]);
  const stored = (k) => row[k];
  check(`${panel}: name changed`, stored("propertyName") === newName, stored("propertyName"));
  check(`${panel}: city changed to Pune`, stored("city") === "Pune", stored("city"));
  // propertyCityId (e.g. NGP-1329) is a stable identifier that ads refer to, so it must NOT change when the city does
  check(`${panel}: the property id code stays stable (propertyCityId)`, String(stored("propertycityid") || "") === `NGP-${id}`, String(stored("propertycityid")));

  for (const k of PROPERTY_TEXT_COLUMNS) {
    const want = EDITED_TEXT[k];
    if (want === undefined) continue;
    let got = stored(k);
    if (k === "possessionDate") got = row.possessionDay;
    const ok = ["latitude", "longitude", "distanceFromCityCenter", "totalSalesPrice", "totalOfferPrice", "stampDuty", "registrationFee", "gst", "advocateFee", "msebWater", "maintenance", "other", "builtYear", "totalFloors"].includes(k)
      ? sameNumber(got, want) || norm(got) === norm(want)
      : norm(got) === norm(want);
    check(`${panel}: saved ${k}`, ok, `wanted ${want}, stored ${got}`);
  }
  for (const k of PROPERTY_LIST_COLUMNS) {
    check(`${panel}: saved ${k}`, JSON.stringify(parseList(stored(k))) === JSON.stringify(EDITED_LISTS[k]), `stored ${stored(k)}`);
  }
  for (const k of LISTING_IMAGE_KEYS) {
    check(`${panel}: saved photos ${k}`, JSON.stringify(parseList(stored(k))) === JSON.stringify(EDITED_IMAGES[k]), `stored ${stored(k)}`);
  }
  check(`${panel}: saved propertyType 3 BHK`, JSON.stringify(parseList(stored("propertyType"))) === JSON.stringify(["3 BHK"]), String(stored("propertyType")));
  check(`${panel}: saved video link`, norm(stored("videoLink")) !== "" && norm(stored("videoLink")).includes("youtube"), String(stored("videoLink")));
  check(`${panel}: saved reel link`, norm(stored("instagramReelLink")).includes("instagram"), String(stored("instagramReelLink")));
  check(`${panel}: EMI recalculated from the new price`, Number(stored("emi")) > 0, String(stored("emi")));
  check(`${panel}: owner unchanged`, panel === "website" ? Number(stored("guestUserId")) === 1 : Number(stored("projectpartnerid")) === 785, `guest ${stored("guestUserId")} partner ${stored("projectpartnerid")}`);
  check(`${panel}: still pending approval after an edit by the lister`, stored("approve") === "Not Approved" || panel === "admin", stored("approve"));

  // ---- what the edit form gets when it reloads ----
  const loaded = await P.load(id);
  check(`${panel}: the edit form can reload the property`, loaded.status === 200, String(loaded.status));
  const L = Array.isArray(loaded.data) ? loaded.data[0] : loaded.data;
  const own = (k, altKey) => (altKey && L?.[altKey] !== undefined ? L[altKey] : L?.[k]);
  check(`${panel}: reload shows the new name`, L?.propertyName === newName, String(L?.propertyName));
  check(`${panel}: reload shows the property's own contact`, norm(own("contact", "propertyContact")) === EDITED_TEXT.contact, `contact=${L?.contact} propertyContact=${L?.propertyContact}`);
  check(`${panel}: reload shows the property's own email`, norm(own("email", "propertyEmail")) === EDITED_TEXT.email, `email=${L?.email} propertyEmail=${L?.propertyEmail}`);
  for (const k of ["address", "pincode", "location", "propertyDescription", "furnishing", "ownershipType", "propertyFacing", "tags"]) {
    check(`${panel}: reload shows ${k}`, norm(L?.[k]) === norm(EDITED_TEXT[k]), `got ${L?.[k]}`);
  }
  for (const k of PROPERTY_LIST_COLUMNS) {
    check(`${panel}: reload shows ${k}`, JSON.stringify(parseList(L?.[k])) === JSON.stringify(EDITED_LISTS[k]), String(L?.[k]));
  }
  for (const k of LISTING_IMAGE_KEYS) {
    check(`${panel}: reload shows photos ${k}`, JSON.stringify(parseList(L?.[k])) === JSON.stringify(EDITED_IMAGES[k]), String(L?.[k]));
  }
  check(`${panel}: reload shows possession date`, String(L?.possessionDate || "").slice(0, 10) === "2027-03-15" || String(L?.possessionDate || "").includes("2027-03-1"), String(L?.possessionDate));
}

// ---- partial edit: a save that sends only a few fields must not wipe the rest ----
console.log("\n== a small edit keeps everything else");
for (const [panel, P] of Object.entries(PANELS)) {
  const [r] = await q("SELECT propertyid FROM properties WHERE propertyName LIKE ? LIMIT 1", [`Roundtrip ${panel} ${ts}%`]);
  const small = await P.edit(r.propertyid, { propertyCategory: "NewFlat", listingType: "Sell", propertyName: `Roundtrip ${panel} ${ts} EDITED`, state: "Maharashtra", city: "Pune", address: "99 Edited Road", propertyDescription: "only the description changed" });
  const [after] = await q("SELECT address, contact, email, furnishing, frontView, propertyDescription, amenitiesFeature FROM properties WHERE propertyid = ?", [r.propertyid]);
  check(`${panel}: a small edit is accepted`, small.status === 200, `${small.status} ${JSON.stringify(small.data).slice(0, 150)}`);
  check(`${panel}: …changes only what was sent`, after.propertyDescription === "only the description changed" && after.contact === EDITED_TEXT.contact && after.furnishing === EDITED_TEXT.furnishing, JSON.stringify(after).slice(0, 250));
  check(`${panel}: …and keeps the photos and lists`, parseList(after.frontView).length === 1 && parseList(after.amenitiesFeature).length === 2, `${after.frontView} ${after.amenitiesFeature}`);
}

await pool.query("DELETE FROM properties WHERE propertyName LIKE ?", [`Roundtrip % ${ts}%`]);
await pool.end();
server.close();
console.log(`\n${pass} checks passed, ${fail} failed`);
if (problems.length) { console.log("\nPROBLEMS:"); problems.forEach((p) => console.log(" - " + p)); }
process.exit(fail ? 1 : 0);
