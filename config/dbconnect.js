import mysql from "mysql2";

const db = mysql.createPool({
  connectionLimit: 20,
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  connectTimeout: 10000, 
});

// Test connection on startup
// db.getConnection((err, connection) => {
//   if (err) {
//     console.error("❌ MySQL connection failed:", err.message);
//   } else {
//     console.log("✅ MySQL connected successfully");
//     connection.release();
//   }
// });

export default db;
