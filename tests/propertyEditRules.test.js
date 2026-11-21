import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collectPropertyColumns } from "../src/core/utils/propertyColumns.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const asMap = ({ columns, values }) => Object.fromEntries(columns.map((c, i) => [c, values[i]]));

describe("who may approve a listing", () => {
  test("a project partner cannot approve their own listing (the route answers 403 and changes nothing)", () => {
    const src = read("../src/portals/projectPartner/routes/propertyRoutes.js");
    assert.match(src, /router\.put\("\/approve\/:id", requirePropertyOwner, \(req, res\) =>\s*res\.status\(403\)/);
    assert.match(src, /Only the Reparv team can approve listings/);
    assert.equal(/\bapprove,\s*\n/.test(src.split("const router")[0]), false, "the approve handler is no longer imported by the partner routes");
  });
  test("the admin approve endpoint still exists and still refuses unpaid listings", () => {
    const admin = read("../src/portals/admin/routes/propertyRoutes.js");
    assert.match(admin, /router\.put\("\/approve\/:id", approve\)/);
    assert.match(read("../src/portals/admin/controllers/propertyController.js"), /The listing fee has not been paid yet/);
  });
});

describe("editing keeps what the form does not send", () => {
  test("a small edit changes only what was sent", () => {
    const m = asMap(collectPropertyColumns({ propertyDescription: "only this" }, { mode: "edit", privileged: false }));
    assert.deepEqual(Object.keys(m), ["propertyDescription"]);
  });
  test("older free-text values (not in today's lists) are stored as they are", () => {
    const m = asMap(collectPropertyColumns({ propertyFacing: "EAST WEST NORTH SOUTH", furnishing: "Fully-Furnished", ownershipType: "Co-operative Society" }, { mode: "edit", privileged: true }));
    assert.equal(m.propertyFacing, "EAST WEST NORTH SOUTH");
    assert.equal(m.furnishing, "Fully-Furnished");
    assert.equal(m.ownershipType, "Co-operative Society");
  });
  test("every description / configuration / feature column is writable from every panel", () => {
    const body = {
      propertyDescription: "d", propertyType: ["3 BHK"], amenitiesFeature: ["Gym"], locationFeature: ["Near School"], smartHomeFeature: ["Smart Locks"],
      securityBenefit: ["CCTV Surveillance"], propertyStatusFeature: "Ready to Move", furnishing: "Semi-Furnished", propertyFacing: "East-facing",
    };
    for (const privileged of [true, false]) {
      const m = asMap(collectPropertyColumns(body, { mode: "edit", privileged }));
      for (const k of Object.keys(body)) assert.ok(k in m, `${k} (privileged=${privileged})`);
    }
  });
});
