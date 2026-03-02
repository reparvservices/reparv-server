import db from "../../config/dbconnect.js";
import moment from "moment-timezone";

// **Fetch All **
export const getAll = (req, res) => {
  const sql = "SELECT * FROM subscribers ORDER BY id DESC";
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

  const sql = "SELECT * FROM subscribers WHERE id = ?";

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Subscriber not found" });
    }
    res.json(result[0]);
  });
};

{/* Add Subscribers */}
export const addSubscriber = (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  // Check already subscribed
  const checkSql = `SELECT id FROM subscribers WHERE email = ?`;

  db.query(checkSql, [email], (err, rows) => {
    if (err) {
      console.error("Check subscriber error:", err);
      return res.status(500).json({ message: "Database error" });
    }

    if (rows.length > 0) {
      return res.status(409).json({
        message: "Email Already Subscribed",
      });
    }

    // Insert subscriber
    const insertSql = `
      INSERT INTO subscribers (email)
      VALUES (?)
    `;

    db.query(insertSql, [email], (err) => {
      if (err) {
        console.error("Add subscriber error:", err);
        return res.status(500).json({ message: "Failed to subscribe" });
      }

      res.status(201).json({
        message: "Subscribed Successfully",
      });
    });
  });
};

// **Delete **
export const del = (req, res) => {
  const Id = parseInt(req.params.id);
  console.log(Id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid ID" });
  }

  db.query("SELECT * FROM subscribers WHERE id = ?", [Id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Subscriber not found" });
    }

    db.query("DELETE FROM subscribers WHERE id = ?", [Id], (err) => {
      if (err) {
        console.error("Error deleting :", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      res.status(200).json({ message: "Subscriber deleted successfully" });
    });
  });
};

//**Change status */
export const status = (req, res) => {
  const Id = parseInt(req.params.id);

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid ID" });
  }

  db.query("SELECT * FROM subscribers WHERE id = ?", [Id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    let status = "";
    if (result[0].status === "Active") {
      status = "Inactive";
    } else {
      status = "Active";
    }
    console.log(status);
    db.query(
      "UPDATE subscribers SET status = ? WHERE id = ?",
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
