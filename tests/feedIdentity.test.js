import test from "node:test";
import assert from "node:assert/strict";
import { decideFeedAccess, shortRole } from "../src/core/middleware/requireFeedIdentity.js";

const me = [{ role: "project", id: "785" }];
const call = (o) => decideFeedAccess({ identities: me, body: {}, query: {}, path: "/posts", ...o });

test("no login is 401", () => {
  assert.equal(call({ method: "GET", identities: [] }).status, 401);
});
test("role spellings normalise", () => {
  assert.equal(shortRole("Project Person"), "project");
  assert.equal(shortRole("sales_partner"), "sales");
  assert.equal(shortRole("customer"), null);
});
test("writes must be the logged-in partner", () => {
  const body = (id, role) => ({ user_id: id, user_role: role });
  assert.equal(call({ method: "POST", body: body(785, "project_partner") }).ok, true);
  assert.equal(call({ method: "POST", body: body(785, "Project Person") }).ok, true);
  assert.equal(call({ method: "POST", body: body(3, "project_partner") }).status, 403);
  assert.equal(call({ method: "DELETE", body: body(785, "sales_partner") }).status, 403);
});
test("private reads must match, profile reads need only a login", () => {
  const q = { user_id: "3", user_role: "project_partner" };
  assert.equal(call({ method: "GET", path: "/notifications", query: q }).status, 403);
  assert.equal(call({ method: "GET", path: "/saved", query: q }).status, 403);
  assert.equal(call({ method: "GET", path: "/followers", query: q }).ok, true);
  assert.equal(call({ method: "GET", path: "/posts/my", query: q }).ok, true);
});
test("missing identity fields fall through to the controller's 400", () => {
  assert.equal(call({ method: "POST", body: {} }).ok, true);
});
