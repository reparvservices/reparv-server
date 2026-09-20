// db-promise.js
import mysql from "mysql2/promise";

const promisePool = mysql.createPool({
  connectionLimit: Number(process.env.DB_PROMISE_POOL_LIMIT) || 10,
  waitForConnections: true,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 3306,
  connectTimeout: 10000,
});

// See dbconnect.js: relax ONLY_FULL_GROUP_BY so GROUP BY queries selecting
// functionally-dependent columns from LEFT JOINed tables don't error out.
promisePool.on("connection", (connection) => {
  connection.query(
    "SET SESSION sql_mode=(SELECT REPLACE(@@sql_mode, 'ONLY_FULL_GROUP_BY', ''))",
    (err) => {
      if (err) console.error("Failed to relax sql_mode:", err);
    }
  );
});

export default promisePool;
