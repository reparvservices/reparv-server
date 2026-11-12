import http from "http";
import "dotenv/config";
import "./core/utils/cron.js";
import app from "./app.js";

const PORT = process.env.PORT || 3000;

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
