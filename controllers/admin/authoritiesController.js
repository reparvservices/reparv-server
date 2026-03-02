import db from "../../config/dbconnect.js";
import moment from "moment-timezone";

// **Fetch All **
export const getAll = (req, res) => {
  const sql = "SELECT * FROM propertyAuthorities ORDER BY authorityNACL";
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
  const sql = "SELECT * FROM propertyAuthorities WHERE id = ?";

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Authority not found" });
    }
    res.json(result[0]);
  });
};

// Add Or Update
export const add = (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const { id, authorityName, authorityNACL } = req.body;

  if (!authorityName || !authorityNACL ) {
    return res.status(400).json({ message: "All fields are required" });
  }

  if (id) {
    // **Update existing role**
    db.query("SELECT * FROM propertyAuthorities WHERE id = ?", [id], (err, result) => {
      if (err) return res.status(500).json({ message: "Database error", error: err });
      if (result.length === 0) return res.status(404).json({ message: "Authority not found" });

      const updateSQL = `UPDATE propertyAuthorities SET authorityName=?, authorityNACL=?, updated_at=? WHERE id=?`;

      db.query(updateSQL, [authorityName, authorityNACL, currentdate, id], (err) => {
        if (err) {
          console.error("Error updating:", err);
          return res.status(500).json({ message: "Database error", error: err });
        }
        return res.status(200).json({ message: "Authority updated successfully" });
      });
    });
  } else {
    // **Check if Authority Already Exists**
    db.query("SELECT * FROM propertyAuthorities WHERE authorityNACL = ?", [authorityNACL], (err, result) => {
      if (err) return res.status(500).json({ message: "Database error", error: err });

      if (result.length > 0) {
        return res.status(202).json({ message: "Authority already exists!" });
      }

      // **Add new role**
      const insertSQL = `INSERT INTO propertyAuthorities (authorityName, authorityNACL, updated_at, created_at) VALUES (?, ?, ?, ?)`;

      db.query(insertSQL, [authorityName, authorityNACL, currentdate, currentdate], (err, result) => {
        if (err) {
          console.error("Error inserting:", err);
          return res.status(500).json({ message: "Database error", error: err });
        }
        return res.status(201).json({ message: "Authority added successfully", Id: result.insertId });
      });
    });
  }
};

// **Delete **
export const del = (req, res) => {
  const Id = parseInt(req.params.id);
  console.log(Id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid ID" });
  }

  db.query("SELECT * FROM propertyAuthorities WHERE id = ?", [Id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Authority not found" });
    }

    db.query("DELETE FROM propertyAuthorities WHERE id = ?", [Id], (err) => {
      if (err) {
        console.error("Error deleting :", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      res.status(200).json({ message: "Authority deleted successfully" });
    });
  });
};

//**Change status */
export const status = (req, res) => {
  const Id = parseInt(req.params.id);
  
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Role ID" });
  }

  db.query("SELECT * FROM propertyAuthorities WHERE id = ?", [Id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    
    let status='';
    if (result[0].status === 'Active') {
      status='Inactive';
    }else{
      status='Active';
    }
    console.log(status);
    db.query("UPDATE propertyAuthorities SET status = ? WHERE id = ?", [status, Id], (err,result) => {
      if (err) {
        console.error("Error deleting :", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      res.status(200).json({ message: "Authority status change successfully" });
    });
  });
};


