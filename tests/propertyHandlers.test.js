import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { addProperty as userAdd, update as userUpdate } from "../src/portals/user/controllers/propertyController.js";
import { v2AddProperty, v2Update } from "../src/portals/projectPartner/controllers/propertyController.js";
import { adminV2AddProperty, adminV2UpdateProperty } from "../src/portals/admin/controllers/propertyV2Controller.js";

// fn(res) must invoke the handler with that res
function call(fn) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(b) { resolve({ status: this.statusCode, body: b }); },
    };
    Promise.resolve(fn(res)).catch((e) => resolve({ status: 500, body: { message: String(e) } }));
  });
}

const body = {
  propertyCategory: "NewFlat",
  listingType: "Sell",
  propertyName: "Green Villa Test",
  state: "Maharashtra",
  city: "Nagpur",
  contact: "9876543210",
  email: "owner@example.com",
  address: "Civil Lines",
  pincode: "440001",
  latitude: 21.14,
  longitude: 79.08,
  totalOfferPrice: 4500000,
  builtUpArea: "1200",
  frontView: ["https://cdn.test/a.jpg"],
};

// Each handler must refuse bad input BEFORE touching the database.
const portals = [
  ["website user", (b, res) => userAdd({ guestUser: { id: 1 }, body: b }, res), (res) => userAdd({ body }, res)],
  ["partner", (b, res) => v2AddProperty({ projectPartnerUser: { id: 1 }, body: b }, res), (res) => v2AddProperty({ body }, res)],
  ["admin", (b, res) => adminV2AddProperty({ body: { projectpartnerid: 1, ...b } }, res), null],
];

for (const [name, add, anon] of portals) {
  describe(`${name}: add listing validation`, () => {
    if (anon) test("not logged in -> 401", async () => assert.equal((await call(anon)).status, 401));

    test("Buy listings are refused", async () => {
      const r = await call((res) => add({ ...body, listingType: "Buy" }, res));
      assert.equal(r.status, 400);
      assert.match(r.body.message, /Buy/);
    });

    test("name, category, city and state are required", async () => {
      for (const k of ["propertyName", "propertyCategory", "city", "state"]) {
        assert.equal((await call((res) => add({ ...body, [k]: "" }, res))).status, 400, k);
      }
    });

    const rules = [
      ["contact", "12345", /contact/i],
      ["pincode", "44", /pincode/i],
      ["address", "", /address/i],
      ["latitude", null, /location/i],
      ["totalOfferPrice", 0, /price/i],
      ["builtUpArea", "", /area/i],
      ["frontView", [], /front view/i],
      ["email", "not-an-email", /email/i],
    ];
    for (const [field, value, msg] of rules) {
      test(`rejects bad ${field}`, async () => {
        const r = await call((res) => add({ ...body, [field]: value }, res));
        assert.equal(r.status, 400);
        assert.match(r.body.message, msg);
      });
    }
  });
}

describe("admin must name the owning partner", () => {
  test("missing or invalid projectpartnerid -> 400", async () => {
    for (const id of [undefined, "", "abc", 0, -1]) {
      const r = await call((res) => adminV2AddProperty({ body: { ...body, projectpartnerid: id } }, res));
      assert.equal(r.status, 400, String(id));
      assert.match(r.body.message, /project partner/i);
    }
  });
});

describe("edit handlers", () => {
  test("website user edit: not logged in -> 401, Buy -> 400, bad email -> 400, bad id -> 400", async () => {
    assert.equal((await call((res) => userUpdate({ params: { id: "1" }, body }, res))).status, 401);
    assert.equal((await call((res) => userUpdate({ guestUser: { id: 1 }, params: { id: "1" }, body: { ...body, listingType: "Buy" } }, res))).status, 400);
    assert.equal((await call((res) => userUpdate({ guestUser: { id: 1 }, params: { id: "abc" }, body }, res))).status, 400);
    const r = await call((res) => userUpdate({ guestUser: { id: 1 }, params: { id: "1" }, body: { ...body, email: "bad" } }, res));
    assert.equal(r.status, 400);
    assert.match(r.body.message, /email/i);
  });

  test("partner and admin edit: bad id, Buy, bad email/contact/pincode -> 400 without touching the database", async () => {
    for (const [label, edit] of [["partner", v2Update], ["admin", adminV2UpdateProperty]]) {
      const run = (params, b) => call((res) => edit({ params, body: b }, res));
      assert.equal((await run({ id: "abc" }, body)).status, 400, `${label}: bad id`);
      assert.equal((await run({ id: "0" }, body)).status, 400, `${label}: zero id`);
      assert.equal((await run({ id: "5" }, { ...body, listingType: "Buy" })).status, 400, `${label}: Buy`);
      for (const [field, value, msg] of [["email", "bad", /email/i], ["contact", "123", /contact/i], ["pincode", "9", /pincode/i]]) {
        const r = await run({ id: "5" }, { ...body, [field]: value });
        assert.equal(r.status, 400, `${label}: ${field}`);
        assert.match(r.body.message, msg);
      }
    }
  });
});
