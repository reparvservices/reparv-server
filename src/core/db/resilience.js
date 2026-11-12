/**
 * Resilience helpers for the MySQL pools.
 *
 * The database lives on AWS RDS. Idle pooled sockets are sometimes dropped by
 * the network (ECONNRESET / EHOSTUNREACH), and the next query on a dead socket
 * either fails or hangs until the OS gives up (~40s). Two small safeguards:
 *   1. every query gets a timeout, so a dead socket fails fast;
 *   2. read-only queries are retried once on a transient connection error
 *      (the pool then hands out a fresh connection). Writes are never retried,
 *      because a dropped connection can leave it unknown whether they applied.
 */

export const RETRYABLE_ERROR_CODES = new Set([
  "ECONNRESET",
  "EHOSTUNREACH",
  "ETIMEDOUT",
  "EPIPE",
  "ENOTFOUND",
  "PROTOCOL_CONNECTION_LOST",
  "PROTOCOL_SEQUENCE_TIMEOUT",
]);

export const DEFAULT_QUERY_TIMEOUT_MS =
  Number(process.env.DB_QUERY_TIMEOUT_MS) || 30000;

export function isRetryableDbError(error) {
  return Boolean(error && RETRYABLE_ERROR_CODES.has(error.code));
}

/** SELECT / SHOW / DESCRIBE only: safe to run twice. */
export function isReadOnlySql(sql) {
  const text = typeof sql === "string" ? sql : sql?.sql;
  return typeof text === "string" && /^\s*(\(?\s*)?(select|show|describe|desc)\b/i.test(text);
}

/** Turn (sql | options) into an options object that carries a timeout. */
export function withTimeout(sqlOrOptions, timeoutMs = DEFAULT_QUERY_TIMEOUT_MS) {
  if (typeof sqlOrOptions === "string") {
    return { sql: sqlOrOptions, timeout: timeoutMs };
  }
  if (sqlOrOptions && typeof sqlOrOptions === "object") {
    return { timeout: timeoutMs, ...sqlOrOptions };
  }
  return sqlOrOptions;
}

/**
 * Wrap a callback-style `pool.query`. Calls without a callback (streaming /
 * event usage) are passed through untouched.
 */
export function wrapCallbackQuery(rawQuery, { timeoutMs } = {}) {
  return function query(sql, values, callback) {
    let params = values;
    let cb = callback;
    if (typeof values === "function") {
      cb = values;
      params = undefined;
    }
    if (typeof cb !== "function") {
      return rawQuery.call(this, sql, values, callback);
    }

    const options = withTimeout(sql, timeoutMs);
    const readOnly = isReadOnlySql(options);
    const run = (attempt) => {
      const done = (error, ...rest) => {
        if (error && attempt === 0 && readOnly && isRetryableDbError(error)) {
          return run(1);
        }
        return cb(error, ...rest);
      };
      return params === undefined
        ? rawQuery.call(this, options, done)
        : rawQuery.call(this, options, params, done);
    };
    return run(0);
  };
}

/** Wrap a promise-style `query` / `execute`. */
export function wrapPromiseQuery(rawFn, { timeoutMs } = {}) {
  return async function run(sql, values) {
    const options = withTimeout(sql, timeoutMs);
    const readOnly = isReadOnlySql(options);
    const call = () =>
      values === undefined
        ? rawFn.call(this, options)
        : rawFn.call(this, options, values);
    try {
      return await call();
    } catch (error) {
      if (readOnly && isRetryableDbError(error)) return call();
      throw error;
    }
  };
}
