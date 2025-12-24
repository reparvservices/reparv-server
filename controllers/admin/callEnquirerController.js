import db from "../../config/dbconnect.js";
import moment from "moment";

export const add = (req, res) => {
  const createdAt = moment().format("YYYY-MM-DD HH:mm:ss");

  const {
    propertyid,
    projectpartnerid,
    type,
    category,
    contact,
  } = req.body;

  // Required validation
  if (!type || !category || !contact) {
    return res.status(400).json({
      message: "contact, type and category are required",
    });
  }

  // 📞 Basic mobile validation
  if (!/^[6-9]\d{9}$/.test(contact)) {
    return res.status(400).json({ message: "Invalid contact number" });
  }

  // Insert enquiry
  const insertSQL = `
      INSERT INTO call_enquirers
      (propertyid, projectpartnerid, type, category, contact, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

  db.query(
    insertSQL,
    [
      propertyid || null,
      projectpartnerid || null,
      type,
      category,
      contact,
      createdAt,
      createdAt,
    ],
    (err2, result) => {
      if (err2) {
        console.error("Insert error:", err2);
        return res.status(500).json({ message: "Database error" });
      }

      res.status(201).json({
        message: "Enquiry added successfully",
        id: result.insertId,
      });
    }
  );
};

// **Fetch All **
export const getAll = (req, res) => {
  const sql = `SELECT call_enquirers.*,
                      projectpartner.fullname AS projectPartnerName,
                      projectpartner.contact AS projectPartnerContact
                FROM call_enquirers
                LEFT JOIN projectpartner ON projectpartner.id = call_enquirers.projectpartnerid
                ORDER BY id DESC`;
  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res.json(result);
  });
};

// **Fetch Single by ID**
export const getById = (req, res) => {
  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid ID" });
  }

  const sql = `SELECT call_enquirers.*,
                      projectpartner.fullname AS projectPartnerName,
                      projectpartner.contact AS projectPartnerContact
                FROM call_enquirers
                LEFT JOIN projectpartner ON projectpartner.id = call_enquirers.projectpartnerid
                WHERE id = ?`;

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Enquiry not found" });
    }
    res.json(result[0]);
  });
};

// **Delete **
export const del = (req, res) => {
  const Id = parseInt(req.params.id);
  console.log(Id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid ID" });
  }

  db.query("SELECT * FROM call_enquirers WHERE id = ?", [Id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Enquiry not found" });
    }

    db.query("DELETE FROM call_enquirers WHERE id = ?", [Id], (err) => {
      if (err) {
        console.error("Error deleting :", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      res.status(200).json({ message: "Enquiry deleted successfully" });
    });
  });
};

//**Change status */
export const status = (req, res) => {
  const Id = parseInt(req.params.id);

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid ID" });
  }

  db.query("SELECT * FROM call_enquirers WHERE id = ?", [Id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    let status = "";
    if (result[0].status === "New") {
      status = "Completed";
    } else {
      status = "New";
    }
    console.log(status);
    db.query(
      "UPDATE call_enquirers SET status = ? WHERE id = ?",
      [status, Id],
      (err, result) => {
        if (err) {
          console.error("Error changing status :", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }
        res.status(200).json({ message: "status change successfully" });
      }
    );
  });
};
