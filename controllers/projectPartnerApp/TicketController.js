import db from "../../config/dbconnect.js";
import moment from "moment";

export const getAll = (req, res) => {
  const ticketGenerator = req.params.generator;
  const projectpartnerid = req.params.id;
  const adharId=req.params.adharId
  if (!ticketGenerator) {
    return res.status(401).json({ message: "Select Generator Not Selected" });
  }

  console.log(ticketGenerator, '', projectpartnerid);

  let sql;
  let params = [projectpartnerid];

  if (ticketGenerator === "Sales Partner") {
    sql = `
      SELECT 
        tickets.*, 
        departments.department,
        employees.name AS employee_name, 
        employees.uid,
        salespersons.fullname AS ticketadder_name, 
        salespersons.contact AS ticketadder_contact
      FROM tickets 
      INNER JOIN salespersons 
        ON (
       salespersons.adharno = tickets.ticketadder
       OR salespersons.email = tickets.ticketadder
     )
      LEFT JOIN departments 
        ON tickets.departmentid = departments.departmentid
      LEFT JOIN employees 
        ON tickets.employeeid = employees.id
      WHERE salespersons.projectpartnerid = ?
      ORDER BY tickets.created_at DESC
    `;
  } else if (ticketGenerator === "Territory Partner") {
    sql = `
      SELECT 
        tickets.*, 
        users.name AS admin_name, 
        departments.department,
        employees.name AS employee_name, 
        employees.uid,
        territorypartner.fullname AS ticketadder_name, 
        territorypartner.contact AS ticketadder_contact
      FROM tickets 
      INNER JOIN territorypartner 
      ON (
       territorypartner.adharno = tickets.ticketadder
       OR territorypartner.email = tickets.ticketadder
     )
      
      LEFT JOIN users 
        ON tickets.adminid = users.id 
      LEFT JOIN departments 
        ON tickets.departmentid = departments.departmentid
      LEFT JOIN employees 
        ON tickets.employeeid = employees.id
      WHERE territorypartner.projectpartnerid = ?
      ORDER BY tickets.created_at DESC
    `;
  } else {

     sql = `
   SELECT 
  tickets.*, 
  users.name AS admin_name, 
  departments.department,
  employees.name AS employee_name, 
  employees.uid,
  projectpartner.fullname AS ticketadder_name, 
  projectpartner.contact AS ticketadder_contact
FROM tickets 
INNER JOIN projectpartner 
  ON (
       projectpartner.adharno = tickets.ticketadder
       OR projectpartner.email = tickets.ticketadder
     )
LEFT JOIN users 
  ON tickets.adminid = users.id 
LEFT JOIN departments 
  ON tickets.departmentid = departments.departmentid
LEFT JOIN employees 
  ON tickets.employeeid = employees.id
WHERE tickets.ticketadder = ?
ORDER BY tickets.created_at DESC;

    `;
    params=[adharId]
  }

  db.query(sql, params, (err, result) => {
    if (err) {
      console.error("Error fetching tickets:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    const formatted = result.map((row) => ({
      ...row,
      created_at: moment(row.created_at).format("DD MMM YYYY | hh:mm A"),
      updated_at: moment(row.updated_at).format("DD MMM YYYY | hh:mm A"),
    }));

    res.json(formatted);
  });
};


// **Fetch Single by ID**
export const getById = (req, res) => {
  const Id = parseInt(req.params.id);

  // Check if ID is valid
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid ticket ID" });
  }

  const sql = `SELECT tickets.*,
   users.name AS admin_name,
    departments.department,
     employees.name AS employee_name,
      employees.uid
       FROM tickets LEFT JOIN users ON tickets.adminid = users.id 
       LEFT JOIN departments ON tickets.departmentid = departments.departmentid
       LEFT JOIN employees ON tickets.employeeid = employees.id
       WHERE ticketid = ? ORDER BY ticketid DESC`;

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching ticket:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (result.length === 0) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    res.status(200).json(result[0]);
  });
};

export const getAdmins = (req, res) => {
  const sql = "SELECT users.id, users.name FROM users ORDER BY id DESC";
  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching Admins:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    return res.status(200).json(result);
  });
};

export const getDepartments = (req, res) => {
  const sql = "SELECT * FROM departments ORDER BY departmentid DESC";
  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching departments:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    return res.status(200).json(result);
  });
};

export const getEmployees = (req, res) => {
  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Employee ID" });
  }

  const sql = "SELECT * FROM employees WHERE departmentid = ? ORDER BY id DESC";
  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching employees:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    return res.json(result);
  });
};

// **Add New **
export const add = (req, res) => {
  const currentDate = moment().format("YYYY-MM-DD HH:mm:ss");
console.log(req.body);

  const adharId = req.params?.adharId;
 // console.log(adharId);
  
  if (!adharId) {
    return res
      .status(401)
      .json({ message: "Unauthorized! Please Login Again" });
  }

  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digits = "0123456789";

  const generateCode = () => {
    const randomLetters = Array.from(
      { length: 3 },
      () => letters[Math.floor(Math.random() * letters.length)]
    ).join("");

    const randomDigits = Array.from(
      { length: 3 },
      () => digits[Math.floor(Math.random() * digits.length)]
    ).join("");

    return randomLetters + randomDigits; // Letters first, then numbers
  };

  const { adminid, departmentid, employeeid, issue, details } = req.body;

  if (!issue || !details) {
    return res.status(400).json({ message: "All fields are required" });
  }

  const tryInsert = () => {
    const ticketno = generateCode();

    const sql = `INSERT INTO tickets (ticketadder, adminid, departmentid, employeeid, ticketno, issue, details, updated_at, created_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    db.query(
      sql,
      [
        adharId,
        adminid,
        departmentid,
        employeeid,
        ticketno,
        issue,
        details,
        currentDate,
        currentDate,
      ],
      (err, result) => {
        if (err) {
          if (err.code === "ER_DUP_ENTRY") {
            // Duplicate ticket number — try again
            console.warn("Duplicate ticket number, retrying...");
            return tryInsert();
          }
          // Other DB error
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }

        // Insert successful
        return res.status(201).json({
          message: "Ticket added successfully",
          Id: result.insertId,
          ticketno,
        });
      }
    );
  };
  tryInsert();
};

/* Change status */
export const changeStatus = (req, res) => {
  const { status } = req.body;

  if (!status || status.trim() === "") {
    return res.status(400).json({ message: "Please select a status!" });
  }

  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid ID" });
  }

  db.query("SELECT * FROM tickets WHERE ticketid = ?", [Id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (result.length === 0) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    db.query(
      "UPDATE tickets SET status = ? WHERE ticketid = ?",
      [status, Id],
      (err) => {
        if (err) {
          console.error("Error changing status:", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }
        res.status(200).json({ message: "Status changed successfully" });
      }
    );
  });
};

// **Edit **
export const update = (req, res) => {
  const Id = parseInt(req.params.id);
  const { adminid, departmentid, employeeid, issue, details } = req.body;

  if (!issue || !details) {
    return res.status(400).json({ message: "All fields are required" });
  }

  db.query("SELECT * FROM tickets WHERE ticketid = ?", [Id], (err, result) => {
    if (err)
      return res.status(500).json({ message: "Database error", error: err });
    if (result.length === 0)
      return res.status(404).json({ message: "Ticket not found" });

    const sql = `UPDATE tickets SET adminid=?, departmentid=?, employeeid=?, issue=?, details=? WHERE ticketid=?`;

    db.query(
      sql,
      [adminid, departmentid, employeeid, issue, details, Id],
      (err) => {
        if (err) {
          console.error("Error updating :", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }
        res.status(200).json({ message: "Ticket updated successfully" });
      }
    );
  });
};

export const addResponse = (req, res) => {
  const ticketId = req.params.id;
  const { ticketResponse, selectedStatus } = req.body;

  if (!ticketResponse || ticketResponse.trim() === "") {
    return res.status(400).json({ message: "Response is required" });
  }
  if (!selectedStatus === "") {
    return res.status(400).json({ message: "Ticket Status is required" });
  }

  const updateQuery =
    "UPDATE tickets SET response = ?, status = ? WHERE ticketid = ?";

  db.query(
    updateQuery,
    [ticketResponse, selectedStatus, ticketId],
    (err, result) => {
      if (err) {
        console.error("Error updating ticket response:", err);
        return res.status(500).json({ message: "Internal Server Error" });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      const fetchQuery = "SELECT * FROM tickets WHERE ticketid = ?";
      db.query(fetchQuery, [ticketId], (err, rows) => {
        if (err) {
          console.error("Error fetching updated ticket:", err);
          return res.status(500).json({ message: "Internal Server Error" });
        }

        res.status(200).json(rows[0]);
      });
    }
  );
};

// **Delete **
export const del = (req, res) => {
  const Id = parseInt(req.params.id);

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Ticket ID" });
  }

  db.query("SELECT * FROM tickets WHERE ticketid = ?", [Id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    db.query("DELETE FROM tickets WHERE ticketid = ?", [Id], (err) => {
      if (err) {
        console.error("Error deleting :", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      res.status(200).json({ message: "Ticket deleted successfully" });
    });
  });
};

