import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { safeEqual, hmacHex, verifyCheckoutSignature } from "../src/core/utils/razorpaySignature.js";

const SECRET = "test_secret";

describe("verifyCheckoutSignature", () => {
  test("accepts the correct order signature (order_id|payment_id)", () => {
    const sig = hmacHex(SECRET, "order_A|pay_B");
    assert.equal(verifyCheckoutSignature(SECRET, "order_A", "pay_B", sig), true);
  });

  test("accepts the correct subscription signature (payment_id|subscription_id)", () => {
    const sig = hmacHex(SECRET, "pay_B|sub_C");
    assert.equal(verifyCheckoutSignature(SECRET, "pay_B", "sub_C", sig), true);
  });

  test("rejects a tampered id, wrong secret, wrong order of ids", () => {
    const sig = hmacHex(SECRET, "order_A|pay_B");
    assert.equal(verifyCheckoutSignature(SECRET, "order_A", "pay_X", sig), false);
    assert.equal(verifyCheckoutSignature("other", "order_A", "pay_B", sig), false);
    assert.equal(verifyCheckoutSignature(SECRET, "pay_B", "order_A", sig), false);
  });

  test("never throws on missing secret or signature, or a different length", () => {
    assert.equal(verifyCheckoutSignature("", "a", "b", "x"), false);
    assert.equal(verifyCheckoutSignature(SECRET, "a", "b", ""), false);
    assert.equal(verifyCheckoutSignature(SECRET, "a", "b", "short"), false);
    assert.equal(verifyCheckoutSignature(SECRET, "a", "b", undefined), false);
  });
});

describe("safeEqual", () => {
  test("compares strings in constant time without throwing on length mismatch", () => {
    assert.equal(safeEqual("abc", "abc"), true);
    assert.equal(safeEqual("abc", "abd"), false);
    assert.equal(safeEqual("abc", "abcd"), false);
    assert.equal(safeEqual(null, undefined), true);
  });
});
