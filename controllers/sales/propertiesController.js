import db from "../../config/dbconnect.js";
import moment from "moment";

// **Fetch All**
export const getAll = (req, res) => {
  const { city, propertyCategory } = req.query;

  let sql = `SELECT * FROM properties WHERE status='Active' AND approve='Approved'`;
  const params = [];

  if (propertyCategory !== "properties") {
    sql += ` AND propertyCategory = ?`;
    params.push(propertyCategory);
  }

  if (city && city.trim() !== "") {
    sql += ` AND city = ?`;
    params.push(city);
  }

  sql += ` ORDER BY propertyid DESC`;

  db.query(sql, params, (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res.json(result);
  });
};

// ** Fetch All City **
export const getAllCity = (req, res) => {
  const sql =
    "select distinct city from properties where status='Active' and approve='Approved' and propertyCategory=? ";
  db.query(sql, [propertyCategory], (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res.json(result);
  });
};

export const getAllLocation = (req, res) => {
  const sql = `
      SELECT DISTINCT location 
      FROM properties 
      WHERE status='Active' AND approve='Approved'
    `;

  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res.status(200).json(result);
  });
};

export const getLocationsByCityAndCategory = (req, res) => {
  const { propertyCategory, city } = req.query;

  if (!propertyCategory || !city) {
    return res
      .status(400)
      .json({ message: "propertyCategory and city are required." });
  }

  const sql = `SELECT DISTINCT location FROM properties 
                 WHERE city = ? AND propertyCategory = ? 
                 AND status='Active' AND approve='Approved'`;

  db.query(sql, [city.trim(), propertyCategory.trim()], (err, result) => {
    if (err) {
      console.error("Error fetching locations:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    const locations = result.map((row) => row.location);
    res.status(200).json(locations);
  });
};
