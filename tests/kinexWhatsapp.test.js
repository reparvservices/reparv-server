import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { sendKinexWhatsapp } from "../src/core/utils/kinexWhatsapp.js";

test("without KINEX_WAPI_KEY the alert is skipped, not sent", async () => {
  const saved = process.env.KINEX_WAPI_KEY;
  delete process.env.KINEX_WAPI_KEY;
  try {
    assert.equal(await sendKinexWhatsapp("9000000000", "hi"), null);
  } finally {
    if (saved !== undefined) process.env.KINEX_WAPI_KEY = saved;
  }
});

test("without a mobile number the alert is skipped", async () => {
  const saved = process.env.KINEX_WAPI_KEY;
  process.env.KINEX_WAPI_KEY = "test-key";
  try {
    assert.equal(await sendKinexWhatsapp("", "hi"), null);
  } finally {
    if (saved === undefined) delete process.env.KINEX_WAPI_KEY;
    else process.env.KINEX_WAPI_KEY = saved;
  }
});

test("no gateway key is written in the source code", () => {
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith("._")) continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith(".js") && /apikey\s*=\s*["'`][a-f0-9]{20,}/i.test(readFileSync(path, "utf8"))) {
        offenders.push(path);
      }
    }
  };
  walk(new URL("../src", import.meta.url).pathname);
  assert.deepEqual(offenders, []);
});
