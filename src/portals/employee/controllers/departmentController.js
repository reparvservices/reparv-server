import db from "#db";
import moment from "moment-timezone";

// **Fetch All **
export const getAll = (req, res) => {
  const projectPartnerId = req.employeeUser?.projectpartnerid;

  if (!projectPartnerId) {
    return res.status(401).json({
      message: "Unauthorized Access — Employee is not linked to any Project Partner.",
    });
  }
  const sql = "SELECT * FROM departments WHERE projectpartnerid = ? ORDER BY department";
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
  const sql = "SELECT * FROM departments WHERE departmentid = ?";

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Department not found" });
    }
    res.json(result[0]);
  });
};

export const addDepartment = (req, res) => {
  const projectPartnerId = req.employeeUser?.projectpartnerid;

  if (!projectPartnerId) {
    return res.status(401).json({
      message: "Unauthorized Access — Employee is not linked to any Project Partner.",
    });
  }
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const { department } = req.body;

  if (!department) {
    return res.status(400).json({ message: "Department name is required" });
  }

  db.query("SELECT * FROM departments WHERE department = ? AND projectpartnerid = ? ", [department, projectPartnerId], (err, result) => {
    if (err) return res.status(500).json({ message: "Database error", error: err });

    if (result.length === 0) {
      const insertSQL = `INSERT INTO departments (projectpartnerid, department, updated_at, created_at) VALUES (?, ?, ?, ?)`;

      db.query(insertSQL, [projectPartnerId, department, currentdate, currentdate], (err, result) => {
        if (err) {
          console.error("Error inserting department:", err);
          return res.status(500).json({ message: "Database error", error: err });
        }
        res.status(201).json({ message: "Department added successfully", id: result.insertId });
      });
    } else {
      return res.status(409).json({ message: "Department already exists" });
    }
  });
};

export const updateDepartment = (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const { departmentid, department } = req.body;

  if (!departmentid || !department) {
    return res.status(400).json({ message: "Department ID and name are required" });
  }

  db.query("SELECT * FROM departments WHERE departmentid = ?", [departmentid], (err, result) => {
    if (err) return res.status(500).json({ message: "Database error", error: err });

    if (result.length === 0) {
      return res.status(404).json({ message: "Department not found" });
    }

    const updateSQL = `UPDATE departments SET department = ?, updated_at = ? WHERE departmentid = ?`;

    db.query(updateSQL, [department, currentdate, departmentid], (err) => {
      if (err) {
        console.error("Error updating department:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      res.status(200).json({ message: "Department updated successfully" });
    });
  });
};

// **Delete **
export const del = (req, res) => {
  const Id = parseInt(req.params.id);

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Department ID" });
  }

  db.query("SELECT * FROM departments WHERE departmentid = ?", [Id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Department not found" });
    }

    db.query("DELETE FROM departments WHERE departmentid = ?", [Id], (err) => {
      if (err) {
        console.error("Error deleting :", err);
        return res.status(500).json({ message: "Database error1", error: err });
      }
      res.status(200).json({ message: "Department deleted successfully" });
    });
  });
};

//**Change status */
export const status = (req, res) => {
  const Id = parseInt(req.params.id);
  
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Department ID" });
  }

  db.query("SELECT * FROM departments WHERE departmentid = ?", [Id], (err, result) => {
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
    db.query("UPDATE departments SET status = ? WHERE departmentid = ?", [status, Id], (err,result) => {
      if (err) {
        console.error("Error deleting :", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      res.status(200).json({ message: "Department status change successfully" });
    });
  });
};
