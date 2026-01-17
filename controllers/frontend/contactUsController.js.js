import db from "../../config/dbconnect.js";

export const add = async (req, res) => {
  try {
    let { fullname, contact, email, subject, message } = req.body;

    if (!fullname || !contact || !email || !subject || !message) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    email = email.trim().toLowerCase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        message: "Invalid email address",
      });
    }

    if (!/^\d{10}$/.test(contact)) {
      return res.status(400).json({
        message: "Contact number must be 10 digits",
      });
    }

    const sql = `
      INSERT INTO contact_us
      (fullname, contact, email, subject, message, status)
      VALUES (?, ?, ?, ?, ?, 'New')
    `;

    const [result] = await db
      .promise()
      .query(sql, [fullname, contact, email, subject, message]);

    res.status(201).json({
      success: true,
      message: "Message sent successfully",
      id: result.insertId,
    });
  } catch (error) {
    console.error("Add contact error:", error);
    res.status(500).json({
      success: false,
      message: "Database error",
    });
  }
};