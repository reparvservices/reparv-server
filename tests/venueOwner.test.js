import test from "node:test";
import assert from "node:assert/strict";
import { validateListing, cleanSocialLinks } from "../src/portals/venues/venueOwnerService.js";

const base = { title: "Lake Villa", type: "villa", price_model: "night", base_price: 10000, capacity: 8, city: "Nagpur" };

test("a normal type needs no custom name and clears any stale one", () => {
  const out = validateListing({ ...base, custom_type: "ignored" });
  assert.equal(out.custom_type, null);
});

test("type 'other' needs a name, which is saved trimmed", () => {
  assert.throws(() => validateListing({ ...base, type: "other" }), /type of venue/);
  assert.throws(() => validateListing({ ...base, type: "other", custom_type: " " }), /type of venue/);
  assert.equal(validateListing({ ...base, type: "other", custom_type: "  Rooftop party space " }).custom_type, "Rooftop party space");
});

test("changing a listing to 'other' on update requires the name too", () => {
  assert.throws(() => validateListing({ type: "other" }, true), /type of venue/);
  assert.equal(validateListing({ type: "other", custom_type: "Studio" }, true).custom_type, "Studio");
  assert.equal("custom_type" in validateListing({ title: "New title" }, true), false);
});

test("social links: only known platforms on their own domains, https only", () => {
  const ok = cleanSocialLinks({
    youtube: "https://www.youtube.com/watch?v=abc", instagram: "https://instagram.com/reparv",
    facebook: "https://fb.watch/xyz", x: "https://x.com/reparv", website: "https://example.com", junk: "https://evil.test",
  });
  assert.deepEqual(Object.keys(ok).sort(), ["facebook", "instagram", "website", "x", "youtube"]);
  assert.throws(() => cleanSocialLinks({ youtube: "https://notyoutube.com/x" }), /youtube/i);
  assert.throws(() => cleanSocialLinks({ instagram: "https://youtube.com/x" }), /instagram/i);
  assert.throws(() => cleanSocialLinks({ youtube: "http://youtube.com/x" }), /https/);
  assert.throws(() => cleanSocialLinks({ website: "javascript:alert(1)" }), /valid link|https/);
  assert.deepEqual(cleanSocialLinks({ youtube: "", instagram: "  " }), {});
  assert.throws(() => cleanSocialLinks({ youtube: "https://evilyoutube.com/x" }), /youtube/i);
});

test("videos must be https links, at most 3", () => {
  const out = validateListing({ ...base, videos: ["https://cdn.test/a.mp4", "https://cdn.test/b.mp4", "https://cdn.test/c.mp4", "https://cdn.test/d.mp4"] });
  assert.equal(JSON.parse(out.videos).length, 3);
  assert.throws(() => validateListing({ ...base, videos: ["http://cdn.test/a.mp4"] }), /https/);
  assert.equal(validateListing({ ...base, videos: "nope" }).videos, "[]");
});
