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

export default promisePool;
