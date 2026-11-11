import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  PARTNER_FEATURES as F,
  requiredFeatureForApi,
  isAllFeaturePlan,
  planHasFeature,
} from "../src/portals/subscription/utils/partnerFeatures.js";

describe("requiredFeatureForApi (project partner)", () => {
  const cases = [
    // Web panel
    ["/project-partner/properties/add", F.PROPERTIES],
    ["/project-partner/enquirers/add", F.LEADS],
    ["/project-partner/customers/add", F.CRM],
    ["/project-partner/builders/add", F.CRM],
    ["/project-partner/employees/add", F.CRM],
    ["/project-partner/sales/add", F.TEAM],
    ["/project-partner/territory/add", F.TEAM],
    ["/project-partner/calender/note/add", F.SITE_VISITS],
    ["/project-partner/event/add", F.SITE_VISITS],
    // Admin endpoints the panel uses for its own team/properties
    ["/admin/salespersons/status/12", F.TEAM],
    ["/admin/territorypartner/delete/3", F.TEAM],
    ["/admin/properties/set/hotdeal/9", F.PROPERTIES],
    ["/admin/properties/images/delete/9", F.PROPERTIES],
    // Mobile app
    ["/projectpartner/property/add", F.PROPERTIES],
    ["/projectpartner/enquiries/create", F.LEADS],
    ["/projectpartner/builders/add", F.CRM],
    ["/projectpartner/employee/add", F.CRM],
    ["/projectpartner/partner/salespartner", F.TEAM],
    ["/projectpartner/event/add", F.SITE_VISITS],
    ["/projectpartner/post/add", F.COMMUNITY],
  ];
  for (const [path, feature] of cases) {
    test(`${path} needs "${feature}"`, () => {
      assert.equal(requiredFeatureForApi(path, "project"), feature);
    });
  }

  test("paths outside plan features stay open", () => {
    for (const path of [
      "/project-partner/tickets/add",
      "/project-partner/profile/edit",
      "/projectpartner/ticket/add",
      "/project-partner/dashboard/count",
    ]) {
      assert.equal(requiredFeatureForApi(path, "project"), null, path);
    }
  });

  test("other partner roles are not feature-gated", () => {
    assert.equal(requiredFeatureForApi("/project-partner/properties/add", "sales"), null);
    assert.equal(requiredFeatureForApi("/admin/salespersons/status/1", "territory"), null);
  });

  test("lookalike paths are not matched by mistake", () => {
    assert.equal(requiredFeatureForApi("/projectpartner/postal/x", "project"), null);
    assert.equal(requiredFeatureForApi("/project-partner/eventual", "project"), null);
  });
});

describe("plan helpers", () => {
  test("only enterprise plans unlock everything", () => {
    assert.equal(isAllFeaturePlan("enterprise"), true);
    assert.equal(isAllFeaturePlan("Enterprise"), true);
    assert.equal(isAllFeaturePlan("paid"), false);
    assert.equal(isAllFeaturePlan("trial"), false);
    assert.equal(isAllFeaturePlan(null), false);
  });

  test("feature names match case-insensitively", () => {
    const set = new Set(["crm access", "sites visit"]);
    assert.equal(planHasFeature(set, F.CRM), true);
    assert.equal(planHasFeature(set, F.SITE_VISITS), true);
    assert.equal(planHasFeature(set, F.TEAM), false);
  });
});
