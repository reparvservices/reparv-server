import test from "node:test";
import assert from "node:assert/strict";
import {
  parseMediaUrls,
  clampPage,
  clampLimit,
  formatPublicPost,
  formatPublicComment,
} from "../src/portals/customerApp/utils/feedFormat.js";

test("parseMediaUrls handles JSON arrays, bare urls, nulls and junk", () => {
  assert.deepEqual(parseMediaUrls('["a.jpg","b.mp4"]'), ["a.jpg", "b.mp4"]);
  assert.deepEqual(parseMediaUrls('"a.jpg"'), ["a.jpg"]);
  assert.deepEqual(parseMediaUrls("/uploads/a.jpg"), ["/uploads/a.jpg"]);
  assert.deepEqual(parseMediaUrls(["x", null, ""]), ["x"]);
  assert.deepEqual(parseMediaUrls(null), []);
  assert.deepEqual(parseMediaUrls("   "), []);
});

test("paging is clamped", () => {
  assert.equal(clampPage("0"), 1);
  assert.equal(clampPage("abc"), 1);
  assert.equal(clampPage("3"), 3);
  assert.equal(clampLimit("500"), 30);
  assert.equal(clampLimit(undefined), 20);
  assert.equal(clampLimit("-5"), 1);
});

test("formatPublicPost exposes only whitelisted fields", () => {
  const out = formatPublicPost({
    id: 7,
    author_id: 99,
    author_role: "project_partner",
    visibility: "all",
    has_liked: 1,
    media_urls: '["a.jpg"]',
    likes_count: "4",
    author_name: null,
  });
  assert.equal(out.author_name, "Reparv Partner");
  assert.equal(out.author_label, "Project Partner");
  assert.equal(out.likes_count, 4);
  assert.deepEqual(out.media_urls, ["a.jpg"]);
  assert.equal("author_id" in out, false);
  assert.equal("has_liked" in out, false);
  assert.equal("visibility" in out, false);
});

test("formatPublicComment falls back to the stored partner name", () => {
  assert.equal(formatPublicComment({ id: 1, partner_name: "Asha" }).author_name, "Asha");
});
