import db from "../../config/dbconnect.js";
import moment from "moment";

// **Add New **
export const add = (req, res) => {
  const currentDate = moment().format("YYYY-MM-DD HH:mm:ss");

  const { user } = req.body;
  if (!user) {
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

  const { issue, details } = req.body;

  if (!issue || !details) {
    return res.status(400).json({ message: "All fields are required" });
  }
  const tryInsert = () => {
    const ticketno = generateCode();

    const sql = `INSERT INTO tickets (ticketadder, ticketno, issue, details, updated_at, created_at) 
                 VALUES (?, ?, ?, ?, ?, ?)`;

    db.query(
      sql,
      [user, ticketno, issue, details, currentDate, currentDate],
      (err, result) => {
        if (err) {
          if (err.code === "ER_DUP_ENTRY") {
            // Duplicate ticket number — try again
            console.warn("Duplicate ticket number, retrying...", err);
            return tryInsert();
          }
          // Other DB error
          console.log(err);

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

// **Fetch All **
export const getAll = (req, res) => {
  const contact = req.params.contact;


  if (!contact) {
    return res
      .status(401)
      .json({ message: "Unauthorized! Please Login again" });
  }
  const sql = `SELECT tickets.*,
   users.name AS admin_name,
    departments.department,
     employees.name AS employee_name,
      employees.uid
       FROM tickets LEFT JOIN users ON tickets.adminid = users.id 
       LEFT JOIN departments ON tickets.departmentid = departments.departmentid
       LEFT JOIN employees ON tickets.employeeid = employees.id
       WHERE tickets.ticketadder = ?
       ORDER BY ticketid DESC`;

  db.query(sql, [contact], (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    const formatted = result.map((row) => ({
      ...row,
      created_at: moment(row.created_at).format("DD MMM YYYY | hh:mm A"),
      updated_at: moment(row.updated_at).format("DD MMM YYYY | hh:mm A"),
    }));
    console.log(formatted);

    res.json(formatted);
  });
};