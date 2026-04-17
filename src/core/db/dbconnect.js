import mysql from "mysql2";

const db = mysql.createPool({
  connectionLimit: Number(process.env.DB_POOL_LIMIT) || 20,
  waitForConnections: true,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 3306,
  connectTimeout: 20000,
});

export default db;
