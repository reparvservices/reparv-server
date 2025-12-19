import db from "../../config/dbconnect.js";
import moment from "moment";

// **Fetch All **
export const getAll = (req, res) => {
  const projectPartnerId = req.employeeUser?.projectpartnerid;
  if (!projectPartnerId) {
    return res.status(401).json({
      message:
        "Unauthorized Access — Employee is not linked to any Project Partner.",
    });
  }
  const sql =
    "SELECT * FROM messages WHERE projectPartnerId = ? ORDER BY id DESC";
  db.query(sql, [projectPartnerId], (err, result) => {
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

  const sql = "SELECT * FROM messages WHERE id = ?";

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Message not found" });
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

  db.query("SELECT * FROM messages WHERE id = ?", [Id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Message not found" });
    }

    db.query("DELETE FROM messages WHERE id = ?", [Id], (err) => {
      if (err) {
        console.error("Error deleting :", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      res.status(200).json({ message: "Message deleted successfully" });
    });
  });
};

//**Change status */
export const status = (req, res) => {
  const Id = parseInt(req.params.id);

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid ID" });
  }

  db.query("SELECT * FROM messages WHERE id = ?", [Id], (err, result) => {
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
      "UPDATE messages SET status = ? WHERE id = ?",
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
