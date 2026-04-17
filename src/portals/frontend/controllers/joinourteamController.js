import db from "#db";
import moment from "moment-timezone";


// **Fetch All**
export const getAll = (req, res) => {
  const sql = "SELECT * FROM joinourteam ORDER BY jtid DESC";
  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res.json(result);
  });
};

// **Fetch Single by ID**
export const getById = (req, res) => {
  const id = parseInt(req.params.id);
  const sql = "SELECT * FROM joinourteam WHERE jtid = ?";

  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Team member not found" });
    }
    res.json(result[0]);
  });
};

// **Add New team member**
export const add = async (req, res) => {
    // console.log(req.body);
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const { firstname, lastname, email, phone, message } = await req.body;

  if (firstname=='' || lastname=='' || email=='' || phone=='' || message=='' ) {
    return res.status(400).json({ message: "All fields are required" });
  }

  db.query("SELECT * FROM joinourteam WHERE email = ?", [email], (err, result) => {
    if (err) return res.status(500).json({ message: "Database error", error: err });

    if (result.length === 0) {
      const insertSQL = `INSERT INTO joinourteam (firstname, lastname, email, phone, message, updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`;

      db.query(insertSQL, [firstname, lastname, email, phone, message, currentdate, currentdate], (err, result) => {
        if (err) {
          console.error("Error inserting:", err);
          return res.status(500).json({ message: "Database error", error: err });
        }
        res.status(201).json({ message: "Team member added successfully", Id: result.insertId });
      });
    } else {
      return res.status(409).json({ message: "Team member already exists!" });
    }
  });
};

// **Edit team member**
export const update = (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const Id = req.body.jtid;
  const { firstname, lastname, email, phone, message } = req.body;

  if (!firstname || !lastname || !email || !phone || !message) {
    return res.status(400).json({ message: "All fields are required" });
  }

  db.query("SELECT * FROM joinourteam WHERE jtid = ?", [Id], (err, result) => {
    if (err) return res.status(500).json({ message: "Database error", error: err });
    if (result.length === 0) return res.status(404).json({ message: "Team member not found" });

    const sql = `UPDATE joinourteam SET firstname=?, lastname=?, email=?, phone=?, message=?, updated_at=? WHERE jtid=?`;

    db.query(sql, [firstname, lastname, email, phone, message, currentdate, Id], (err) => {
      if (err) {
        console.error("Error updating:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      res.status(200).json({ message: "Team member updated successfully" });
    });
  });
};

// **Delete**
export const deleteTeam = (req, res) => {
  const Id = parseInt(req.params.id);

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Team ID" });
  }

  db.query("SELECT * FROM joinourteam WHERE jtid = ?", [Id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Team member not found" });
    }

    db.query("DELETE FROM joinourteam WHERE jtid = ?", [Id], (err) => {
      if (err) {
        console.error("Error deleting:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      res.status(200).json({ message: "Team member deleted successfully" });
    });
  });
};

// **Change Status**
export const status = (req, res) => {
  const Id = parseInt(req.params.id);

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Team ID" });
  }

  db.query("SELECT * FROM joinourteam WHERE jtid = ?", [Id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (result.length === 0) {
      return res.status(404).json({ message: "Team member not found" });
    }

    const newStatus = result[0].status === "Active" ? "Inactive" : "Active";

    db.query("UPDATE joinourteam SET status = ? WHERE jtid = ?", [newStatus, Id], (err) => {
      if (err) {
        console.error("Error updating status:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      res.status(200).json({ message: `Team member status changed to ${newStatus}` });
    });
  });
};

