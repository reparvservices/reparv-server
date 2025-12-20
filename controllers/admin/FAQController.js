import db from "../../config/dbconnect.js";
import moment from "moment";

// **Fetch All **
export const getAll = (req, res) => {
  const location = req.params.location;
  if (!location) {
    return res.send(401).json({ message: "Location Not Found!" });
  }
  const sql = "SELECT * FROM faq WHERE location ORDER BY RAND()";
  db.query(sql, [location], (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res.json(result);
  });
};

// **Fetch All **
export const getAllActive = (req, res) => {
  const location = req.params.location;
  if (!location) {
    return res.send(401).json({ message: "Location Not Found!" });
  }
  const sql =
    "SELECT * FROM faq WHERE status = 'Active' AND location = ? ORDER BY RAND()";
  db.query(sql, [location], (err, result) => {
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
  const sql = "SELECT * FROM faq WHERE id = ?";

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "FAQ not found" });
    }
    res.json(result[0]);
  });
};

export const add = (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const { location, type, question, answer } = req.body;

  // Validation
  if (!location || !type || !question || !answer) {
    return res.status(400).json({
      message: "Location, type, question, and answer are required",
    });
  }

  const insertSQL = `
    INSERT INTO faq (
      location,
      type,
      question,
      answer,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `;

  db.query(
    insertSQL,
    [location, type, question, answer, currentdate, currentdate],
    (err, result) => {
      if (err) {
        console.error("Error inserting FAQ:", err);
        return res.status(500).json({
          message: "Database error while adding FAQ",
          error: err,
        });
      }

      return res.status(201).json({
        message: "FAQ added successfully",
        faqId: result.insertId,
      });
    }
  );
};

export const update = (req, res) => {
  const faqId = req.params.id;
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const { location, type, question, answer } = req.body;

  // Validation
  if (!faqId || !location || !type || !question || !answer) {
    return res.status(400).json({
      message: "FAQ ID, location, type, question, and answer are required",
    });
  }

  const updateSQL = `
    UPDATE faq SET
      location = ?,
      type = ?,
      question = ?,
      answer = ?,
      updated_at = ?
    WHERE id = ?
  `;

  db.query(
    updateSQL,
    [location, type, question, answer, currentdate, faqId],
    (err, result) => {
      if (err) {
        console.error("Error updating FAQ:", err);
        return res.status(500).json({
          message: "Database error while updating FAQ",
          error: err,
        });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "FAQ not found" });
      }

      return res.status(200).json({
        message: "FAQ updated successfully",
      });
    }
  );
};

//**Change status */
export const status = (req, res) => {
  const Id = parseInt(req.params.id);

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid ID" });
  }

  db.query("SELECT * FROM faq WHERE id = ?", [Id], (err, result) => {
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
      "UPDATE faq SET status = ? WHERE id = ?",
      [status, Id],
      (err, result) => {
        if (err) {
          console.error("Error status changing :", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }
        res.status(200).json({ message: "Status change successfully" });
      }
    );
  });
};

// **Delete **
export const del = (req, res) => {
  const Id = parseInt(req.params.id);
  console.log(Id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid ID" });
  }

  db.query("SELECT * FROM faq WHERE id = ?", [Id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "FAQ not found" });
    }

    db.query("DELETE FROM faq WHERE id = ?", [Id], (err) => {
      if (err) {
        console.error("Error deleting :", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      res.status(200).json({ message: "FAQ deleted successfully" });
    });
  });
};
