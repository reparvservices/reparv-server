import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  LISTING_IMAGE_KEYS,
  toPropertyTypeJson,
  listingValidationError,
  parseImageList,
} from "../src/core/utils/propertyListing.js";

const valid = {
  contact: "9876543210",
  pincode: "440001",
  address: "Civil Lines, Nagpur",
  latitude: 21.15,
  longitude: 79.09,
  frontView: ["https://example.com/a.jpg"],
  offerPrice: 4500000,
  area: "1200",
};

describe("listingValidationError", () => {
  test("a complete listing passes", () => {
    assert.equal(listingValidationError(valid), null);
  });

  const broken = [
    ["contact", "12345", /contact/i],
    ["contact", "5876543210", /contact/i],
    ["pincode", "4400", /pincode/i],
    ["address", "  ", /address/i],
    ["latitude", null, /location/i],
    ["offerPrice", 0, /price/i],
    ["area", "", /area/i],
    ["frontView", [], /front view/i],
    ["frontView", [""], /front view/i],
  ];
  for (const [field, value, message] of broken) {
    test(`rejects bad ${field} (${JSON.stringify(value)})`, () => {
      assert.match(listingValidationError({ ...valid, [field]: value }), message);
    });
  }
});

describe("parseImageList", () => {
  test("array stays an array without empty entries", () => {
    assert.deepEqual(parseImageList(["a.jpg", "", null, "b.jpg"]), ["a.jpg", "b.jpg"]);
  });

  test("JSON text", () => {
    assert.deepEqual(parseImageList('["https://x/a.jpg"]'), ["https://x/a.jpg"]);
  });

  test("double-encoded JSON (old bug) is recovered", () => {
    const double = JSON.stringify(JSON.stringify(["https://x/a.jpg", "https://x/b.jpg"]));
    assert.deepEqual(parseImageList(double), ["https://x/a.jpg", "https://x/b.jpg"]);
  });

  test("a single plain URL or path", () => {
    assert.deepEqual(parseImageList("https://x/a.jpg"), ["https://x/a.jpg"]);
    assert.deepEqual(parseImageList("/uploads/a.jpg"), ["/uploads/a.jpg"]);
  });

  test("empty, broken or junk values give an empty list", () => {
    for (const v of [null, undefined, "", "   ", "[broken", "not a url", 42]) {
      assert.deepEqual(parseImageList(v), [], String(v));
    }
  });
});

describe("toPropertyTypeJson", () => {
  test("stores BHK as a JSON array", () => {
    assert.equal(toPropertyTypeJson(["2 BHK", "3 BHK"]), '["2 BHK","3 BHK"]');
    assert.equal(toPropertyTypeJson("2 BHK"), '["2 BHK"]');
  });

  test("empty values become NULL", () => {
    assert.equal(toPropertyTypeJson([]), null);
    assert.equal(toPropertyTypeJson(""), null);
    assert.equal(toPropertyTypeJson(["", "  "]), null);
  });
});

test("all 23 photo types are listed once", () => {
  assert.equal(LISTING_IMAGE_KEYS.length, 23);
  assert.equal(new Set(LISTING_IMAGE_KEYS).size, 23);
});
