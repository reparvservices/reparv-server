import { test } from "node:test";
import assert from "node:assert/strict";
import { outboundDecision } from "../src/core/utils/localSafetyGuards.js";

const withEnv = (vars, fn) => {
  const saved = {};
  for (const k of Object.keys(vars)) { saved[k] = process.env[k]; process.env[k] = vars[k]; }
  try { return fn(); } finally { for (const k of Object.keys(vars)) saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]); }
};

test("by default every message host is blocked, including the login OTP SMS", () => {
  withEnv({ ALLOW_OTP_SMS: "" }, () => {
    for (const host of ["2factor.in", "graph.facebook.com", "fcm.googleapis.com", "kinextechnologies.in"]) {
      assert.ok(outboundDecision(host, "POST"), host);
    }
    assert.ok(outboundDecision("api.razorpay.com", "POST"));
  });
});

test("ALLOW_OTP_SMS=true lets only the OTP SMS host through", () => {
  withEnv({ ALLOW_OTP_SMS: "true" }, () => {
    assert.equal(outboundDecision("2factor.in", "POST"), null);
    assert.ok(outboundDecision("graph.facebook.com", "POST"), "WhatsApp stays blocked");
    assert.ok(outboundDecision("fcm.googleapis.com", "POST"), "push stays blocked");
    assert.ok(outboundDecision("kinextechnologies.in", "POST"), "Kinex WhatsApp stays blocked");
    assert.ok(outboundDecision("api.razorpay.com", "POST"), "Razorpay writes stay blocked");
    assert.equal(outboundDecision("api.razorpay.com", "GET"), null, "reads were never blocked");
  });
});

test("the flag only matches the exact value true", () => {
  withEnv({ ALLOW_OTP_SMS: "1" }, () => assert.ok(outboundDecision("2factor.in", "POST")));
});

test("ALLOW_RAZORPAY_TEST opens Razorpay only for test keys, never live keys", () => {
  withEnv({ ALLOW_RAZORPAY_TEST: "true", RAZORPAY_KEY_ID: "rzp_test_abc123" }, () => {
    assert.equal(outboundDecision("api.razorpay.com", "POST"), null);
    assert.ok(outboundDecision("graph.facebook.com", "POST"), "everything else stays blocked");
    assert.ok(outboundDecision("2factor.in", "POST"), "OTP SMS needs its own flag");
  });
  withEnv({ ALLOW_RAZORPAY_TEST: "true", RAZORPAY_KEY_ID: "rzp_live_abc123" }, () => {
    assert.ok(outboundDecision("api.razorpay.com", "POST"), "live keys stay blocked");
  });
  withEnv({ ALLOW_RAZORPAY_TEST: "", RAZORPAY_KEY_ID: "rzp_test_abc123" }, () => {
    assert.ok(outboundDecision("api.razorpay.com", "POST"), "off unless asked for");
  });
  withEnv({ ALLOW_RAZORPAY_TEST: "true", RAZORPAY_KEY_ID: "" }, () => {
    assert.ok(outboundDecision("api.razorpay.com", "POST"), "no key, no access");
  });
});

test("ALLOW_RAZORPAY_LIVE opens only Razorpay, and only when asked for", () => {
  withEnv({ ALLOW_RAZORPAY_LIVE: "true", RAZORPAY_KEY_ID: "rzp_live_abc123" }, () => {
    assert.equal(outboundDecision("api.razorpay.com", "POST"), null);
    for (const host of ["graph.facebook.com", "kinextechnologies.in", "fcm.googleapis.com", "2factor.in"]) {
      assert.ok(outboundDecision(host, "POST"), `${host} stays blocked`);
    }
  });
  withEnv({ ALLOW_RAZORPAY_LIVE: "", RAZORPAY_KEY_ID: "rzp_live_abc123" }, () => {
    assert.ok(outboundDecision("api.razorpay.com", "POST"), "live keys stay blocked unless the flag is set");
  });
  withEnv({ ALLOW_RAZORPAY_LIVE: "yes", RAZORPAY_KEY_ID: "rzp_live_abc123" }, () => {
    assert.ok(outboundDecision("api.razorpay.com", "POST"), "only the exact value true counts");
  });
});
