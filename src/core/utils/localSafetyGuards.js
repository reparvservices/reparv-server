/**
 * Safety guards for running this server on a LOCAL machine against a
 * PRODUCTION database. Every guard is opt-in through .env and is a no-op when
 * its flag is not "true". Import this module first in src/server.js so the
 * patches are in place before any other module creates a client.
 *
 *   READ_ONLY_DB=true    block INSERT/UPDATE/DELETE/DDL at the mysql2 layer
 *   DISABLE_OUTBOUND=true block email, SMS/OTP, WhatsApp, push, Razorpay writes,
 *                         and the sheet-sync URL from API_URL
 *   ALLOW_RAZORPAY_LIVE=true (only with DISABLE_OUTBOUND) allow Razorpay with LIVE keys: REAL
 *                         money moves on every payment and refund. Everything else stays blocked
 *   ALLOW_RAZORPAY_TEST=true (only with DISABLE_OUTBOUND) allow Razorpay calls, but ONLY when
 *                         RAZORPAY_KEY_ID is a test key (rzp_test_...); live keys stay blocked
 *   ALLOW_OTP_SMS=true    (only with DISABLE_OUTBOUND) let the login OTP SMS (2factor.in)
 *                         through so you can log in locally; all else stays blocked
 *
 * (Cron jobs and schema migrations are switched off in src/server.js and the
 * schema helpers, using DISABLE_CRON and SKIP_SCHEMA_MIGRATIONS.)
 */
import { EventEmitter } from "events";
import https from "https";
import path from "path";
import { createRequire } from "module";
import nodemailer from "nodemailer";
import axiosEsm from "axios";

const require = createRequire(import.meta.url);

const flag = (name) => process.env[name] === "true";
const READ_ONLY_DB = flag("READ_ONLY_DB");
const DISABLE_OUTBOUND = flag("DISABLE_OUTBOUND");

const log = (msg) => console.warn(`[local-guard] ${msg}`);

// ── 1. READ_ONLY_DB ──────────────────────────────────────────────────────────

const WRITE_SQL = /^\s*\(?\s*(insert|update|delete|replace|create|alter|drop|truncate|rename|grant|revoke|lock)\b/i;

function sqlText(sql) {
  return typeof sql === "string" ? sql : sql?.sql;
}

function blockedDbError(text) {
  const err = new Error(
    `READ_ONLY_DB is on: blocked write "${String(text).trim().slice(0, 60)}..."`,
  );
  err.code = "READ_ONLY_DB_BLOCKED";
  return err;
}

if (READ_ONLY_DB) {
  // mysql2 exports map forbids deep imports, so load the file by absolute path.
  const mysql2Dir = path.dirname(require.resolve("mysql2"));
  const Connection = require(path.join(mysql2Dir, "lib", "connection.js"));
  // pool connections, promise connections and getConnection() all end up here.
  for (const method of ["query", "execute"]) {
    const original = Connection.prototype[method];
    Connection.prototype[method] = function guardedDbCall(sql, values, callback) {
      const text = sqlText(sql);
      if (typeof text === "string" && WRITE_SQL.test(text)) {
        const err = blockedDbError(text);
        const cb = typeof values === "function" ? values : callback;
        log(err.message);
        if (typeof cb === "function") {
          process.nextTick(cb, err);
          return undefined;
        }
        throw err;
      }
      return original.apply(this, arguments);
    };
  }
  log("READ_ONLY_DB on: write statements are blocked.");
}

// ── 2. DISABLE_OUTBOUND ──────────────────────────────────────────────────────

// Hosts that send real messages or move money. All methods are blocked.
const ALWAYS_BLOCKED_HOSTS = [
  "2factor.in", // SMS / OTP
  "kinextechnologies.in", // WhatsApp (Kinex WAPI gateway)
  "graph.facebook.com", // WhatsApp Cloud API
  "fcm.googleapis.com", // Firebase push
];

// Hosts where only writes are blocked (reads are harmless).
const WRITE_ONLY_BLOCKED_HOSTS = ["api.razorpay.com"];

function hostOf(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

function matchesHost(host, list) {
  return list.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

/** Opt-in: let the login OTP text message through while everything else stays blocked. */
const OTP_SMS_HOST = "2factor.in";

export function outboundDecision(host, method) {
  if (!host) return null;
  const sheetSyncHost = hostOf(process.env.API_URL || "");
  if (sheetSyncHost && host === sheetSyncHost) return "sheet-sync";
  if (flag("ALLOW_OTP_SMS") && host === OTP_SMS_HOST) return null;
  // Explicit opt-in to use Razorpay with LIVE keys from this machine: real payments and refunds.
  // Only Razorpay is opened; WhatsApp, SMS, email and push stay blocked.
  if (flag("ALLOW_RAZORPAY_LIVE") && host === "api.razorpay.com") return null;
  // Razorpay TEST mode only: no real money can move, so payments can be tried locally.
  // Never passes for live keys (rzp_live_...).
  if (
    flag("ALLOW_RAZORPAY_TEST") &&
    host === "api.razorpay.com" &&
    String(process.env.RAZORPAY_KEY_ID || "").startsWith("rzp_test_")
  ) return null;
  if (matchesHost(host, ALWAYS_BLOCKED_HOSTS)) return host;
  if (matchesHost(host, WRITE_ONLY_BLOCKED_HOSTS) && method !== "GET") return host;
  return null;
}

/** Parse the (url | options, options?, callback?) arguments of https.request. */
function requestTarget(args) {
  const [first, second] = args;
  if (typeof first === "string") {
    return { host: hostOf(first), method: (second?.method || "GET").toUpperCase() };
  }
  if (first instanceof URL) {
    return { host: first.hostname, method: (second?.method || "GET").toUpperCase() };
  }
  const host = first?.hostname || first?.host?.split(":")[0] || null;
  return { host, method: (first?.method || "GET").toUpperCase() };
}

/** Anything can be read or called on this; it never does anything. */
const noop = new Proxy(function noopFn() {}, {
  get: (_t, prop) => (prop === "then" ? undefined : noop),
  apply: () => noop,
});

/** A request object that fails with `err` on the next tick, whatever is called on it. */
function failingRequest(err) {
  const emitter = new EventEmitter();
  const req = new Proxy(emitter, {
    get(target, prop) {
      if (prop in target) {
        const value = target[prop];
        return typeof value === "function" ? value.bind(target) : value;
      }
      return noop;
    },
  });
  process.nextTick(() => emitter.emit("error", err));
  return req;
}

/**
 * axios callers (SMS, WhatsApp, Razorpay SDK) get a proper axios-style error
 * with a `response`, because the Razorpay SDK reads `err.response.status`.
 */
function axiosGuard(config) {
  let full = config.url || "";
  try {
    full = new URL(config.url || "", config.baseURL || undefined).toString();
  } catch {
    /* relative URL without a base: leave as-is */
  }
  const verb = (config.method || "get").toUpperCase();
  const blocked = outboundDecision(hostOf(full), verb);
  if (!blocked) return config;
  const message = `DISABLE_OUTBOUND is on: blocked ${verb} to ${blocked}`;
  log(message);
  const err = new Error(message);
  err.code = "OUTBOUND_BLOCKED";
  err.isAxiosError = true;
  err.config = config;
  err.response = {
    status: 403,
    statusText: "Blocked by local guard",
    data: { status: "error", message, error: { description: message } },
    headers: {},
    config,
  };
  throw err;
}

if (DISABLE_OUTBOUND) {
  // The app imports axios as ESM and the Razorpay SDK requires it as CJS:
  // these are two separate default instances, so both get patched.
  const axiosCjs = require("axios");
  for (const ax of [axiosCjs.default || axiosCjs, axiosEsm]) {
    if (!ax || typeof ax.create !== "function") continue;
    ax.interceptors.request.use(axiosGuard);
    const originalCreate = ax.create;
    ax.create = function guardedCreate(...args) {
      const instance = originalCreate.apply(this, args);
      instance.interceptors.request.use(axiosGuard);
      return instance;
    };
  }

  for (const method of ["request", "get"]) {
    const original = https[method];
    https[method] = function guardedHttps(...args) {
      const { host, method: verb } = requestTarget(args);
      const blocked = outboundDecision(host, verb);
      if (blocked) {
        const err = new Error(`DISABLE_OUTBOUND is on: blocked ${verb} to ${blocked}`);
        err.code = "OUTBOUND_BLOCKED";
        log(err.message);
        return failingRequest(err);
      }
      return original.apply(this, args);
    };
  }

  const originalCreateTransport = nodemailer.createTransport;
  nodemailer.createTransport = function guardedCreateTransport(...args) {
    const transporter = originalCreateTransport.apply(this, args);
    const block = async () => {
      const err = new Error("DISABLE_OUTBOUND is on: email sending is blocked");
      err.code = "OUTBOUND_BLOCKED";
      log(err.message);
      throw err;
    };
    transporter.sendMail = block;
    transporter.verify = block;
    return transporter;
  };
  log("DISABLE_OUTBOUND on: email, SMS, WhatsApp, push and Razorpay writes are blocked.");
  if (flag("ALLOW_RAZORPAY_LIVE")) {
    log("WARNING: ALLOW_RAZORPAY_LIVE is on. Razorpay calls are allowed, so real payments and refunds will move REAL money if the keys are live.");
  }
}
