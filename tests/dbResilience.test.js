import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  isRetryableDbError,
  isReadOnlySql,
  withTimeout,
  wrapCallbackQuery,
  wrapPromiseQuery,
} from "../src/core/db/resilience.js";

const reset = Object.assign(new Error("reset"), { code: "ECONNRESET" });
const syntax = Object.assign(new Error("bad sql"), { code: "ER_PARSE_ERROR" });

describe("classification", () => {
  test("transient network errors are retryable, SQL errors are not", () => {
    assert.equal(isRetryableDbError(reset), true);
    assert.equal(isRetryableDbError(Object.assign(new Error(), { code: "EHOSTUNREACH" })), true);
    assert.equal(isRetryableDbError(syntax), false);
    assert.equal(isRetryableDbError(null), false);
  });
  test("only reads count as read-only", () => {
    assert.equal(isReadOnlySql("  SELECT 1"), true);
    assert.equal(isReadOnlySql("show tables"), true);
    assert.equal(isReadOnlySql("INSERT INTO t VALUES (1)"), false);
    assert.equal(isReadOnlySql("UPDATE t SET a=1"), false);
    assert.equal(isReadOnlySql({ sql: "select 1" }), true);
  });
  test("a timeout is added without overriding an explicit one", () => {
    assert.deepEqual(withTimeout("select 1", 5), { sql: "select 1", timeout: 5 });
    assert.equal(withTimeout({ sql: "select 1", timeout: 9 }, 5).timeout, 9);
  });
});

describe("callback pool wrapper", () => {
  test("retries a read once after a connection reset", () => {
    let calls = 0;
    const raw = (opts, params, cb) => {
      calls += 1;
      return calls === 1 ? cb(reset) : cb(null, [{ ok: 1 }]);
    };
    let result;
    wrapCallbackQuery(raw)("SELECT 1", [1], (err, rows) => { result = { err, rows }; });
    assert.equal(calls, 2);
    assert.equal(result.err, null);
    assert.deepEqual(result.rows, [{ ok: 1 }]);
  });

  test("never retries a write", () => {
    let calls = 0;
    const raw = (opts, cb) => { calls += 1; return cb(reset); };
    let err;
    wrapCallbackQuery(raw)("INSERT INTO t VALUES (1)", (e) => { err = e; });
    assert.equal(calls, 1);
    assert.equal(err.code, "ECONNRESET");
  });

  test("gives up after one retry and passes real SQL errors straight through", () => {
    let calls = 0;
    const raw = (opts, cb) => { calls += 1; return cb(reset); };
    let err;
    wrapCallbackQuery(raw)("SELECT 1", (e) => { err = e; });
    assert.equal(calls, 2);
    assert.equal(err.code, "ECONNRESET");

    calls = 0;
    const bad = (opts, cb) => { calls += 1; return cb(syntax); };
    wrapCallbackQuery(bad)("SELECT oops", (e) => { err = e; });
    assert.equal(calls, 1);
    assert.equal(err.code, "ER_PARSE_ERROR");
  });

  test("calls without a callback are passed through unchanged", () => {
    const raw = (...args) => args;
    assert.deepEqual(wrapCallbackQuery(raw)("SELECT 1"), ["SELECT 1", undefined, undefined]);
  });
});

describe("promise pool wrapper", () => {
  test("retries reads, not writes", async () => {
    let calls = 0;
    const flaky = async () => { calls += 1; if (calls === 1) throw reset; return [[{ ok: 1 }]]; };
    assert.deepEqual(await wrapPromiseQuery(flaky)("SELECT 1"), [[{ ok: 1 }]]);
    assert.equal(calls, 2);

    calls = 0;
    const alwaysFails = async () => { calls += 1; throw reset; };
    await assert.rejects(wrapPromiseQuery(alwaysFails)("UPDATE t SET a=1"), /reset/);
    assert.equal(calls, 1);
  });
});
