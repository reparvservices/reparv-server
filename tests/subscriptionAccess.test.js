import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  isPartnerSubscriptionAccessActive,
  pickCurrentSubscription,
} from "../src/portals/subscription/utils/subscriptionAccess.js";

const days = (n) => new Date(Date.now() + n * 86400000).toISOString();

describe("isPartnerSubscriptionAccessActive", () => {
  test("active plan before its end date grants access", () => {
    assert.equal(isPartnerSubscriptionAccessActive({ status: "active", end_date: days(5) }), true);
  });

  test("active plan past its end date does not", () => {
    assert.equal(isPartnerSubscriptionAccessActive({ status: "active", end_date: days(-1) }), false);
  });

  test("cancelled at period end keeps access until the end date", () => {
    assert.equal(isPartnerSubscriptionAccessActive({ status: "cancelled", end_date: days(3) }), true);
    assert.equal(isPartnerSubscriptionAccessActive({ status: "cancelled", end_date: days(-3) }), false);
  });

  test("free trial stored as active + plan_type trial grants access", () => {
    assert.equal(
      isPartnerSubscriptionAccessActive({ status: "active", plan_type: "trial", end_date: days(10) }),
      true,
    );
  });

  test("pending, expired and halted rows never grant access", () => {
    for (const status of ["pending", "expired", "halted"]) {
      assert.equal(isPartnerSubscriptionAccessActive({ status, end_date: days(10) }), false, status);
    }
  });

  test("missing row is not active", () => {
    assert.equal(isPartnerSubscriptionAccessActive(null), false);
  });
});

describe("pickCurrentSubscription", () => {
  test("returns null for no rows", () => {
    assert.equal(pickCurrentSubscription([]), null);
  });

  test("a newer pending checkout does not hide the running plan", () => {
    const rows = [
      { id: 2, status: "pending", updated_at: days(0) },
      { id: 1, status: "active", start_date: days(-5), end_date: days(25), updated_at: days(-5) },
    ];
    assert.equal(pickCurrentSubscription(rows).id, 1);
  });

  test("a plan bought during a long trial takes over", () => {
    const rows = [
      { id: 1, status: "active", plan_type: "trial", start_date: days(-30), end_date: days(330) },
      { id: 2, status: "active", plan_type: "paid", start_date: days(-1), end_date: days(29) },
    ];
    assert.equal(pickCurrentSubscription(rows).id, 2);
  });

  test("with nothing running, the most recently updated row is shown", () => {
    const rows = [
      { id: 1, status: "expired", updated_at: days(-10) },
      { id: 2, status: "expired", updated_at: days(-1) },
    ];
    assert.equal(pickCurrentSubscription(rows).id, 2);
  });
});
