


import db from "../../config/dbconnect.js";

export const submitContactForm = (req, res) => {
  const { fullName, email, contact, message } = req.body;

  // Basic validation
  if (!fullName || !email || !contact || !message) {
    return res.status(400).json({ message: "All fields are required" });
  }

  const sql =
    "INSERT INTO contact_messages (full_name, email, contact, message) VALUES (?, ?, ?, ?)";

  // Using mysql2 callback style
  db.query(sql, [fullName, email, contact, message], (err, results) => {
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

