import test from "node:test";
import assert from "node:assert/strict";
import { tokenMatchesCustomer } from "../src/core/middleware/requireCustomer.js";

const row = { id: 373, email: "a@x.com", contact: "9322396236" };

test("phone-OTP token ({id, contact}) is accepted", () => {
  assert.equal(tokenMatchesCustomer({ id: 373, contact: "9322396236" }, row), true);
});
test("Google token ({id, email}) is accepted, case-insensitively", () => {
  assert.equal(tokenMatchesCustomer({ id: 373, email: "A@X.com" }, row), true);
});
test("wrong id, wrong contact or wrong email is rejected", () => {
  assert.equal(tokenMatchesCustomer({ id: 1, contact: "9322396236" }, row), false);
  assert.equal(tokenMatchesCustomer({ id: 373, contact: "111" }, row), false);
  assert.equal(tokenMatchesCustomer({ id: 373, email: "b@x.com" }, row), false);
});
test("a token with no identifier beyond id (e.g. a partner token) is rejected", () => {
  assert.equal(tokenMatchesCustomer({ id: 373 }, row), false);
  assert.equal(tokenMatchesCustomer(null, row), false);
});
