import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  rolesForDecodedToken,
  resolveCheckoutIdentities,
  bodyMatchesIdentity,
  requireCheckoutIdentity,
} from "../src/core/middleware/requireCheckoutIdentity.js";

// verify stub: the "token" is a JSON string that decodes to itself
const verify = (t) => {
  if (t === "bad") throw new Error("invalid");
  return JSON.parse(t);
};

const reqWith = ({ cookies, bearer, body } = {}) => ({
  cookies,
  headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  body,
});

describe("rolesForDecodedToken", () => {
  test("project partner tokens (freeProjectPartner) map to project only", () => {
    assert.deepEqual(rolesForDecodedToken({ id: 5, freeProjectPartner: "Inactive" }), ["project"]);
  });
  test("sales/territory tokens are ambiguous and map to both", () => {
    assert.deepEqual(rolesForDecodedToken({ id: 5, state: "MH", projectpartnerid: 1 }), ["sales", "territory"]);
  });
  test("a token without an id proves nothing", () => {
    assert.deepEqual(rolesForDecodedToken({ username: "x" }), []);
    assert.deepEqual(rolesForDecodedToken(null), []);
  });
});

describe("resolveCheckoutIdentities + bodyMatchesIdentity", () => {
  test("cookie identity has a fixed role", () => {
    const ids = resolveCheckoutIdentities(
      reqWith({ cookies: { projectPartnerToken: JSON.stringify({ id: 9 }) } }),
      verify,
    );
    assert.deepEqual(ids, [{ role: "project", id: "9" }]);
  });

  test("a partner may pay for themselves", () => {
    const ids = resolveCheckoutIdentities(
      reqWith({ bearer: JSON.stringify({ id: 785, freeProjectPartner: "Inactive" }) }),
      verify,
    );
    assert.equal(bodyMatchesIdentity({ role: "project", user_id: 785 }, ids), true);
    assert.equal(bodyMatchesIdentity({ role: "project", user_id: "785" }, ids), true);
  });

  test("a partner cannot pay on behalf of another user id", () => {
    const ids = resolveCheckoutIdentities(
      reqWith({ bearer: JSON.stringify({ id: 785, freeProjectPartner: "Inactive" }) }),
      verify,
    );
    assert.equal(bodyMatchesIdentity({ role: "project", user_id: 3 }, ids), false);
  });

  test("a project token cannot be used for the sales role", () => {
    const ids = resolveCheckoutIdentities(
      reqWith({ bearer: JSON.stringify({ id: 785, freeProjectPartner: "Inactive" }) }),
      verify,
    );
    assert.equal(bodyMatchesIdentity({ role: "sales", user_id: 785 }, ids), false);
  });

  test("invalid tokens yield no identity", () => {
    assert.deepEqual(resolveCheckoutIdentities(reqWith({ bearer: "bad" }), verify), []);
    assert.deepEqual(resolveCheckoutIdentities(reqWith({ cookies: { salesToken: "bad" } }), verify), []);
  });
});

describe("requireCheckoutIdentity middleware", () => {
  const run = (req) => {
    let status = null;
    let nexted = false;
    const res = { status: (s) => ((status = s), { json: () => {} }) };
    requireCheckoutIdentity(req, res, () => (nexted = true));
    return { status, nexted };
  };

  test("no login -> 401", () => {
    assert.deepEqual(run(reqWith({ body: { role: "project", user_id: 1 } })), { status: 401, nexted: false });
  });

  test("can be switched off with CHECKOUT_REQUIRE_AUTH=false", () => {
    process.env.CHECKOUT_REQUIRE_AUTH = "false";
    try {
      assert.deepEqual(run(reqWith({ body: { role: "project", user_id: 1 } })), { status: null, nexted: true });
    } finally {
      delete process.env.CHECKOUT_REQUIRE_AUTH;
    }
  });
});
