import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { requireWebsiteCustomer } from "../src/core/middleware/requireWebsiteCustomer.js";

const run = (guard, req) =>
  new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(b) { resolve({ status: this.statusCode, body: b, nexted: false }); },
    };
    guard(req, res, () => resolve({ status: 200, nexted: true, req }));
  });

describe("requireWebsiteCustomer (website venue booking login)", () => {
  const row = { id: 7, fullname: "Asha", email: "a@b.com", contact: "9876543210" };

  test("no website login -> 401", async () => {
    const g = requireWebsiteCustomer(async () => [[row]]);
    assert.equal((await run(g, {})).status, 401);
    assert.equal((await run(g, { guestUser: {} })).status, 401);
    assert.equal((await run(g, { guestUser: { id: "abc" } })).status, 401);
  });

  test("a token for a user that no longer exists -> 401", async () => {
    const g = requireWebsiteCustomer(async () => [[]]);
    assert.equal((await run(g, { guestUser: { id: 7 } })).status, 401);
  });

  test("logged in -> req.customer is the guestUsers row", async () => {
    const g = requireWebsiteCustomer(async (sql, params) => {
      assert.deepEqual(params, [7]);
      return [[row]];
    });
    const out = await run(g, { guestUser: { id: 7 } });
    assert.equal(out.nexted, true);
    assert.deepEqual(out.req.customer, row);
  });

  test("database failure -> 500 and the request is stopped", async () => {
    const g = requireWebsiteCustomer(async () => { throw new Error("down"); });
    const out = await run(g, { guestUser: { id: 7 } });
    assert.equal(out.status, 500);
    assert.equal(out.nexted, false);
  });
});

describe("website booking routes", () => {
  const src = readFileSync(new URL("../src/portals/venues/venueRoutes.js", import.meta.url), "utf8");
  const mount = readFileSync(new URL("../src/http/mountProtectedRoutes.js", import.meta.url), "utf8");

  test("every booking route sits behind the website login", () => {
    assert.match(src, /websiteBookingRouter\.use\(requireWebsiteCustomer\(\)\)/);
    const useAt = src.indexOf("websiteBookingRouter.use(");
    const firstRoute = src.indexOf("websiteBookingRouter.get(");
    assert.ok(useAt > -1 && useAt < firstRoute, "login guard must come before the routes");
  });

  test("create, verify, cancel and list are exposed and mounted under /user", () => {
    for (const r of ['websiteBookingRouter.get("/"', 'websiteBookingRouter.post("/"', '"/verify"', '"/:id/cancel"']) {
      assert.ok(src.includes(r), r);
    }
    assert.match(mount, /app\.use\("\/user\/venue-bookings", websiteBookingRouter\)/);
  });
});

import { withCancelPreview } from "../src/portals/venues/venueRoutes.js";

describe("my bookings: cancel preview", () => {
  const base = { cancellation_policy: "moderate", amount_paid: 10000, start_date: "2026-12-20", end_date: "2026-12-21" };

  test("a confirmed booking far ahead refunds in full under the policy", () => {
    const [b] = withCancelPreview([{ ...base, status: "confirmed" }], "2026-12-01");
    assert.equal(b.can_cancel, true);
    assert.equal(b.cancel_refund_percent, 100);
    assert.equal(b.cancel_refund_amount, 10000);
  });

  test("close to the date the refund shrinks, then is nothing", () => {
    assert.equal(withCancelPreview([{ ...base, status: "confirmed" }], "2026-12-16")[0].cancel_refund_percent, 50);
    assert.equal(withCancelPreview([{ ...base, status: "confirmed" }], "2026-12-19")[0].cancel_refund_amount, 0);
  });

  test("an unpaid hold can be cancelled with no refund", () => {
    const [b] = withCancelPreview([{ ...base, status: "held", amount_paid: 0 }], "2026-12-01");
    assert.equal(b.can_cancel, true);
    assert.equal(b.cancel_refund_amount, 0);
  });

  test("cancelled, completed and past stays cannot be cancelled", () => {
    for (const status of ["cancelled", "completed", "expired"]) {
      assert.equal(withCancelPreview([{ ...base, status }], "2026-12-01")[0].can_cancel, false, status);
    }
    assert.equal(withCancelPreview([{ ...base, status: "confirmed" }], "2026-12-25")[0].can_cancel, false);
  });
});

import { h } from "../src/portals/venues/venueRoutes.js";
import { httpError } from "../src/portals/venues/venueService.js";

describe("venue route errors", () => {
  const call = async (fn) => {
    let out;
    const res = { headersSent: false, status(c) { this.code = c; return this; }, json(b) { out = { code: this.code, ...b }; this.headersSent = true; } };
    const origError = console.error; console.error = () => {};
    try { await h(fn)({}, res); } finally { console.error = origError; }
    return out;
  };

  test("a message written on purpose is shown, even for a 502", async () => {
    const out = await call(() => { throw httpError(502, "Could not start the payment. Please try again."); });
    assert.equal(out.code, 502);
    assert.equal(out.message, "Could not start the payment. Please try again.");
  });

  test("an unexpected crash stays generic and leaks nothing", async () => {
    const out = await call(() => { throw new Error("ER_BAD_FIELD_ERROR: secret column x"); });
    assert.equal(out.code, 500);
    assert.equal(out.message, "Something went wrong.");
  });

  test("client errors keep their message", async () => {
    const out = await call(() => { throw httpError(409, "Those dates are no longer available."); });
    assert.deepEqual([out.code, out.message], [409, "Those dates are no longer available."]);
  });
});
