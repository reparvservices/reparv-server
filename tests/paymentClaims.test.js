import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  claimPayment,
  markApplied,
  releaseClaim,
} from "../src/portals/subscription/utils/paymentClaims.js";

/** In-memory claim store with the same semantics as the MySQL one. */
function memoryStore() {
  const rows = new Map();
  return {
    rows,
    async insertIfAbsent(id, { role, userId }) {
      if (rows.has(id)) return false;
      rows.set(id, { role, userId, status: "processing", updatedAt: Date.now() });
      return true;
    },
    async get(id) {
      return rows.get(id) || null;
    },
    async takeOverIfStale(id, staleMs) {
      const r = rows.get(id);
      if (r && r.status === "processing" && Date.now() - r.updatedAt > staleMs) {
        r.updatedAt = Date.now();
        return true;
      }
      return false;
    },
    async setApplied(id) {
      const r = rows.get(id);
      if (r) r.status = "applied";
    },
    async remove(id) {
      if (rows.get(id)?.status === "processing") rows.delete(id);
    },
  };
}

const owner = { role: "project", userId: 7 };

describe("claimPayment", () => {
  test("first caller claims, second sees it still processing", async () => {
    const store = memoryStore();
    assert.equal(await claimPayment(store, "pay_1", owner), "claimed");
    assert.equal(await claimPayment(store, "pay_1", owner), "processing");
  });

  test("two concurrent verifies: exactly one wins (no double extension)", async () => {
    const store = memoryStore();
    const results = await Promise.all([
      claimPayment(store, "pay_2", owner),
      claimPayment(store, "pay_2", owner),
      claimPayment(store, "pay_2", owner),
    ]);
    assert.equal(results.filter((r) => r === "claimed").length, 1);
  });

  test("after activation a retry is reported as already applied", async () => {
    const store = memoryStore();
    await claimPayment(store, "pay_3", owner);
    await markApplied(store, "pay_3");
    assert.equal(await claimPayment(store, "pay_3", owner), "applied");
  });

  test("a different partner cannot reuse the payment", async () => {
    const store = memoryStore();
    await claimPayment(store, "pay_4", owner);
    await markApplied(store, "pay_4");
    assert.equal(await claimPayment(store, "pay_4", { role: "project", userId: 8 }), "other_user");
    assert.equal(await claimPayment(store, "pay_4", { role: "sales", userId: 7 }), "other_user");
  });

  test("a failed activation releases the claim so the retry can run", async () => {
    const store = memoryStore();
    await claimPayment(store, "pay_5", owner);
    await releaseClaim(store, "pay_5");
    assert.equal(await claimPayment(store, "pay_5", owner), "claimed");
  });

  test("release never removes an already-applied payment", async () => {
    const store = memoryStore();
    await claimPayment(store, "pay_6", owner);
    await markApplied(store, "pay_6");
    await releaseClaim(store, "pay_6");
    assert.equal(await claimPayment(store, "pay_6", owner), "applied");
  });

  test("a crashed attempt (stale processing claim) can be taken over", async () => {
    const store = memoryStore();
    await claimPayment(store, "pay_7", owner);
    store.rows.get("pay_7").updatedAt = Date.now() - 10 * 60_000;
    assert.equal(await claimPayment(store, "pay_7", owner), "claimed");
  });

  test("release swallows store errors", async () => {
    const store = memoryStore();
    store.remove = async () => {
      throw new Error("db down");
    };
    await assert.doesNotReject(() => releaseClaim(store, "pay_8"));
  });
});
