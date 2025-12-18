


import db from "../../config/dbconnect.js";

export const submitContactForm = (req, res) => {
  const { fullName, contact, message } = req.body;

  // Basic validation
  if (!fullName ||  !contact || !message) {
    return res.status(400).json({ message: "All fields are required" });
  }

  const sql =
    "INSERT INTO messages (fullname,contact, message) VALUES (?, ?, ?)";

  // Using mysql2 callback style
  db.query(sql, [fullName,contact, message], (err, results) => {
    if (err) {
      console.error("Contact Form Error:", err);
      return res.status(500).json({ message: "Server error" });
    }

    res.status(201).json({
      success: true,
      message: "Contact form submitted successfully",
    });
  });
};




export const createSchedule = (req, res) => {
  const { fullName, contact, date, time, message } = req.body;
console.log(req.body);

  // Basic validation
  if (!fullName || !contact || !date || !time) {
    return res.status(400).json({
      success: false,
      message: "All required fields missing",
    });
  }

  const sql = `
    INSERT INTO schedule_requests 
    (full_name, contact, scheduled_date, scheduled_time, message)
    VALUES (?, ?, ?, ?, ?)
  `;

  // mysql2 callback style
  db.query(
    sql,
    [fullName, contact, date, time, message || null],
    (err, results) => {
      if (err) {
        console.error("Create Schedule Error:", err);
        return res.status(500).json({
          success: false,
          message: "Server Error",
        });
      }

      res.status(201).json({
        success: true,
        message: "Schedule request submitted successfully",
      });
    }
  );
};


