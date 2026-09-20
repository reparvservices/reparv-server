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

// Many queries GROUP BY a table's primary key while selecting non-aggregated
// columns from LEFT JOINed tables that are functionally dependent on it
// (e.g. property_analytics.views per property). MySQL's ONLY_FULL_GROUP_BY
// can't prove that dependency and rejects them, so strip it per-connection.
db.on("connection", (connection) => {
  connection.query(
    "SET SESSION sql_mode=(SELECT REPLACE(@@sql_mode, 'ONLY_FULL_GROUP_BY', ''))",
    (err) => {
      if (err) console.error("Failed to relax sql_mode:", err);
    }
  );
});

export default db;
