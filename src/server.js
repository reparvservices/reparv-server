import http from "http";
import "dotenv/config";
// Must load before any module that creates a DB, mail, HTTP or Razorpay client.
import "./core/utils/localSafetyGuards.js";
import app from "./app.js";

const PORT = process.env.PORT || 3000;

// Scheduled jobs send messages and change subscriptions, so they are opt-out
// for local runs against production (DISABLE_CRON=true).
if (process.env.DISABLE_CRON === "true") {
  console.warn("[local-guard] DISABLE_CRON on: scheduled jobs are not started.");
} else {
  await import("./core/utils/cron.js");
}

const server = http.createServer(app);

// Start the server
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// A stray rejected promise (e.g. a dropped DB connection inside a cron job)
// must be logged, not crash the whole API.
process.on("unhandledRejection", (reason) => {
  console.error("[process] Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[process] Uncaught exception:", error);
});

// Let in-flight requests finish when the process manager stops the server.
function shutdown(signal) {
  console.log(`[process] ${signal} received, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
