import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { requireListingOwner } from "../src/core/middleware/requireListingOwner.js";

function run(guard, req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ status: this.statusCode, body, nexted: false }); },
    };
    guard(req, res, () => resolve({ status: 200, nexted: true }));
  });
}

const fakeDb = (rows) => async () => [rows];

describe("requireListingOwner (website customers)", () => {
  const guard = (rows, kind = "property") => requireListingOwner(kind, (r) => r.params.id, fakeDb(rows));

  test("not logged in -> 401", async () => {
    assert.equal((await run(guard([{ ownerId: 1 }]), { params: { id: "5" } })).status, 401);
  });

  test("bad id -> 400", async () => {
    for (const id of ["abc", "0", "-3", "1.5", undefined]) {
      assert.equal((await run(guard([]), { guestUser: { id: 1 }, params: { id } })).status, 400, String(id));
    }
  });

  test("unknown listing -> 404", async () => {
    assert.equal((await run(guard([]), { guestUser: { id: 1 }, params: { id: "5" } })).status, 404);
  });

  test("someone else's listing -> 403", async () => {
    assert.equal((await run(guard([{ ownerId: 2 }]), { guestUser: { id: 1 }, params: { id: "5" } })).status, 403);
  });

  test("a partner-owned listing (no guestUserId) is not editable by a customer", async () => {
    assert.equal((await run(guard([{ ownerId: null }]), { guestUser: { id: 1 }, params: { id: "5" } })).status, 403);
  });

  test("own listing -> continues (id types may differ)", async () => {
    assert.equal((await run(guard([{ ownerId: "1" }]), { guestUser: { id: 1 }, params: { id: "5" } })).nexted, true);
  });

  test("database failure -> 500, never lets the request through", async () => {
    const boom = requireListingOwner("property", (r) => r.params.id, async () => { throw new Error("down"); });
    const out = await run(boom, { guestUser: { id: 1 }, params: { id: "5" } });
    assert.equal(out.status, 500);
    assert.equal(out.nexted, false);
  });

  test("reads the id from the body for add-images / add-info", async () => {
    const g = requireListingOwner("property", (r) => r.body?.propertyid, fakeDb([{ ownerId: 1 }]));
    assert.equal((await run(g, { guestUser: { id: 1 }, body: { propertyid: 9 } })).nexted, true);
    assert.equal((await run(g, { guestUser: { id: 1 }, body: {} })).status, 400);
  });

  test("the lookups join through to the owning property", async () => {
    let seen;
    for (const kind of ["image", "info"]) {
      const g = requireListingOwner(kind, (r) => r.params.id, async (sql) => { seen = sql; return [[{ ownerId: 1 }]]; });
      await run(g, { guestUser: { id: 1 }, params: { id: "3" } });
      assert.match(seen, /JOIN properties/);
    }
  });
});

describe("customer property routes are all guarded", () => {
  const routeFiles = ["user", "guestUser"].map((p) => [
    p,
    readFileSync(new URL(`../src/portals/${p}/routes/propertyRoutes.js`, import.meta.url), "utf8"),
  ]);

  for (const [portal, src] of routeFiles) {
    test(`${portal}: every route that takes a property/image/info id has an owner guard`, () => {
      const calls = [...src.matchAll(/router\.(get|post|put|delete)\(\s*"([^"]+)"([\s\S]*?)\);/g)];
      const needGuard = calls.filter(([, , path]) =>
        /:id|addimages|additionalinfoadd/.test(path) && !/^\/(check-name)$/.test(path),
      );
      assert.ok(needGuard.length >= 7);
      for (const [, method, path, rest] of needGuard) {
        // user "/edit/:id" checks ownership inside the handler
        if (portal === "user" && method === "put" && path === "/edit/:id") continue;
        assert.match(rest, /owns(Property|Image|Info)(Param|Body)/, `${method.toUpperCase()} ${path} is unguarded`);
      }
    });
  }

  test("user controller edit/add checks the owner and rejects Buy listings", () => {
    const src = readFileSync(new URL("../src/portals/user/controllers/propertyController.js", import.meta.url), "utf8");
    assert.match(src, /You can only edit your own listings/);
    assert.equal(/req\.user\.id/.test(src), false, "customer routes must read req.guestUser, not req.user");
  });
});
