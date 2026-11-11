import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  readAdBody,
  AD_CATEGORIES,
} from "../src/portals/admin/controllers/advertisementController.js";

const valid = {
  title: "Flat 40% off on sofa sets",
  advertiserName: "Nagpur Furniture House",
  category: "Furniture",
  targetUrl: "https://example.com/offer",
};

describe("readAdBody", () => {
  test("a valid ad is accepted and trimmed", () => {
    const { error, values } = readAdBody({ ...valid, title: "  Sofa sale  ", city: "" });
    assert.equal(error, undefined);
    assert.equal(values.title, "Sofa sale");
    assert.equal(values.city, null); // empty city = all cities
    assert.equal(values.displayOrder, 0);
  });

  test("phone-only ads are allowed and the number is cleaned", () => {
    const { error, values } = readAdBody({ ...valid, targetUrl: "", contactPhone: "98765 43210" });
    assert.equal(error, undefined);
    assert.equal(values.contactPhone, "9876543210");
  });

  const rejected = [
    [{ title: "" }, /title is required/i],
    [{ title: "x".repeat(121) }, /120 characters/i],
    [{ advertiserName: "" }, /advertiser name is required/i],
    [{ category: "Cars" }, /valid category/i],
    [{ description: "x".repeat(301) }, /300 characters/i],
    [{ targetUrl: "javascript:alert(1)" }, /http/i],
    [{ targetUrl: "data:text/html,hi" }, /http/i],
    [{ targetUrl: "not a url" }, /full URL/i],
    [{ targetUrl: "", contactPhone: "" }, /website link or a contact number/i],
    [{ contactPhone: "12ab" }, /contact number/i],
    [{ startDate: "2026-13-40" }, /start date/i],
    [{ startDate: "2026-12-10", endDate: "2026-12-01" }, /end date cannot be before/i],
  ];
  for (const [patch, message] of rejected) {
    test(`rejects ${JSON.stringify(patch).slice(0, 60)}`, () => {
      const { error } = readAdBody({ ...valid, ...patch });
      assert.match(error ?? "", message);
    });
  }

  test("categories are real-estate related and unique", () => {
    assert.ok(AD_CATEGORIES.includes("Furniture"));
    assert.ok(AD_CATEGORIES.includes("Home Loans"));
    assert.equal(new Set(AD_CATEGORIES).size, AD_CATEGORIES.length);
  });
});
