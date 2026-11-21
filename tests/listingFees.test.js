import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  resolveBaseFee, feeBreakdown, decideListingFee, validateRule, validateSettings,
} from "../src/portals/listingFees/listingFeePricing.js";

const rules = [
  { listing_type: "Any", property_category: "NewFlat", amount: 500 },
  { listing_type: "Rent", property_category: "NewFlat", amount: 300 },
  { listing_type: "Any", property_category: "Plot", amount: 0 },
];
const on = { enabled: 1, free_per_user: 1, default_fee: 200 };

describe("resolveBaseFee: most specific rule wins", () => {
  test("category + Sell/Rent beats category for any", () => {
    assert.equal(resolveBaseFee({ defaultFee: 200, rules }, { listingType: "Rent", category: "NewFlat" }), 300);
    assert.equal(resolveBaseFee({ defaultFee: 200, rules }, { listingType: "Sell", category: "NewFlat" }), 500);
  });
  test("category rule for any type, then the default fee", () => {
    assert.equal(resolveBaseFee({ defaultFee: 200, rules }, { listingType: null, category: "NewFlat" }), 500);
    assert.equal(resolveBaseFee({ defaultFee: 200, rules }, { listingType: "Sell", category: "FarmLand" }), 200);
  });
  test("an explicit 0 rule means free for that type, not the default", () => {
    assert.equal(resolveBaseFee({ defaultFee: 200, rules }, { listingType: "Sell", category: "Plot" }), 0);
  });
  test("junk amounts become 0", () => {
    assert.equal(resolveBaseFee({ defaultFee: "abc", rules: [] }, { category: "X" }), 0);
    assert.equal(resolveBaseFee({ defaultFee: -50, rules: [] }, { category: "X" }), 0);
  });
});

describe("feeBreakdown: GST is added on top of the admin's amount", () => {
  test("500 + 18% = 590", () => assert.deepEqual(feeBreakdown(500, 18), { base: 500, gst: 90, total: 590 }));
  test("rounds to whole rupees", () => assert.deepEqual(feeBreakdown(99, 18), { base: 99, gst: 18, total: 117 }));
  test("zero is zero", () => assert.deepEqual(feeBreakdown(0, 18), { base: 0, gst: 0, total: 0 }));
});

describe("decideListingFee", () => {
  const decide = (over) => decideListingFee({ settings: on, rules, freeUsed: 0, listingType: "Sell", category: "NewFlat", gstRate: 18, ...over });

  test("switched off: nothing changes", () => {
    assert.equal(decide({ settings: { ...on, enabled: 0 } }).mode, "off");
    assert.equal(decide({ settings: null }).mode, "off");
  });
  test("the first listing is free", () => {
    const d = decide({ freeUsed: 0 });
    assert.deepEqual([d.mode, d.fee.total], ["free", 0]);
  });
  test("the second listing is paid, using the type's fee plus GST", () => {
    const d = decide({ freeUsed: 1 });
    assert.deepEqual([d.mode, d.fee.base, d.fee.gst, d.fee.total], ["paid", 500, 90, 590]);
    assert.equal(decide({ freeUsed: 1, listingType: "Rent" }).fee.base, 300);
  });
  test("a bigger free allowance is honoured", () => {
    const s = { ...on, free_per_user: 3 };
    assert.equal(decide({ settings: s, freeUsed: 2 }).mode, "free");
    assert.equal(decide({ settings: s, freeUsed: 3 }).mode, "paid");
  });
  test("zero free listings means every listing is paid", () => {
    assert.equal(decide({ settings: { ...on, free_per_user: 0 }, freeUsed: 0 }).mode, "paid");
  });
  test("a type with a 0 fee is waived: nothing to pay", () => {
    assert.equal(decide({ freeUsed: 1, category: "Plot" }).mode, "waived");
  });
  test("no rule and no default fee: nothing to pay", () => {
    assert.equal(decide({ settings: { ...on, default_fee: 0 }, freeUsed: 1, category: "Unknown" }).mode, "waived");
  });
});

describe("admin input validation", () => {
  test("rules", () => {
    assert.equal(validateRule({ listing_type: "Sell", property_category: "NewFlat", amount: 500 }), null);
    assert.match(validateRule({ listing_type: "Buy", property_category: "NewFlat", amount: 5 }), /Sell, Rent or Any/);
    assert.match(validateRule({ listing_type: "Any", property_category: " ", amount: 5 }), /property type/i);
    for (const amount of [-1, 1.5, "abc", 2_000_000]) {
      assert.match(validateRule({ listing_type: "Any", property_category: "X", amount }), /whole amount/i, String(amount));
    }
  });
  test("settings", () => {
    assert.equal(validateSettings({ free_per_user: 1, default_fee: 0 }), null);
    assert.match(validateSettings({ free_per_user: -1, default_fee: 0 }), /Free listings/);
    assert.match(validateSettings({ free_per_user: 1.5, default_fee: 0 }), /Free listings/);
    assert.match(validateSettings({ free_per_user: 1, default_fee: -5 }), /Default fee/);
  });
});

describe("wiring", () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

  test("the user fee routes sit behind the website login; admin routes are under /admin", () => {
    const routes = read("../src/portals/listingFees/listingFeeRoutes.js");
    assert.ok(routes.indexOf("userListingFeeRouter.use(requireWebsiteCustomer())") < routes.indexOf("userListingFeeRouter.get("));
    const mount = read("../src/http/mountProtectedRoutes.js");
    assert.match(mount, /app\.use\("\/user\/listing-fees", userListingFeeRouter\)/);
    assert.match(mount, /app\.use\("\/admin\/listing-fees", adminListingFeeRouter\)/);
  });

  test("both user add paths decide the fee, and remove the listing if that fails", () => {
    for (const p of ["../src/portals/user/controllers/propertyController.js", "../src/portals/guestUser/controllers/propertyController.js"]) {
      const src = read(p);
      assert.match(src, /assignListingFee\(\{ userId: partnerId, propertyId: newPropertyId \}\)/, p);
      assert.match(src, /removing the new listing/, p);
      assert.match(src, /payment_required: fee\.payment_required/, p);
    }
  });

  test("unpaid listings are hidden from the admin list and cannot be approved", () => {
    const src = read("../src/portals/admin/controllers/propertyController.js");
    assert.match(src, /row\.fee_status !== "pending"/);
    assert.match(src, /result\[0\]\.fee_status === "pending"/);
  });

  test("the Razorpay webhook also handles listing fee payments", () => {
    assert.match(read("../src/portals/webhooks/controllers/razorpayWebhookController.js"), /handleListingFeeOrderPaidWebhook\(payload\)/);
  });

  test("the migration does not touch existing rows (new nullable column only)", () => {
    const sql = read("../migrations/2026-11-22_listing_fees.sql");
    assert.match(sql, /ALTER TABLE properties ADD COLUMN fee_status VARCHAR\(12\) NULL/);
    assert.equal(/UPDATE properties|DELETE FROM properties|DROP /i.test(sql), false);
  });
});
