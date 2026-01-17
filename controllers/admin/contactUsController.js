import db from "../../config/dbconnect.js";

/* ================================
   FETCH ALL CONTACTS
================================ */
export const getAll = async (req, res) => {
  try {
    const [rows] = await db
      .promise()
      .query("SELECT * FROM contact_us ORDER BY id DESC");

    res.status(200).json(rows);
  } catch (error) {
    console.error("Fetch error:", error);
    res.status(500).json({ message: "Database error" });
  }
};

/* ================================
   FETCH BY ID
================================ */
export const getById = async (req, res) => {
  const id = Number(req.params.id);

  if (!id) {
    return res.status(400).json({ message: "Invalid ID" });
  }

  try {
    const [rows] = await db
      .promise()
      .query("SELECT * FROM contact_us WHERE id = ?", [id]);

    if (!rows.length) {
      return res.status(404).json({ message: "Message not found" });
    }

    res.status(200).json(rows[0]);
  } catch (error) {
    console.error("Fetch error:", error);
    res.status(500).json({ message: "Database error" });
  }
};

/* ================================
   DELETE CONTACT
================================ */
export const del = async (req, res) => {
  const id = Number(req.params.id);

  if (!id) {
    return res.status(400).json({ message: "Invalid ID" });
  }

  try {
    const [result] = await db
      .promise()
      .query("DELETE FROM contact_us WHERE id = ?", [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Message not found" });
    }

    res.status(200).json({ message: "Message deleted successfully" });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ message: "Database error" });
  }
};

/* ================================
   UPDATE STATUS
================================ */
export const updateStatus = async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body;

  const allowedStatus = ["New", "In Progress", "Resolved", "Closed"];

  if (!id) {
    return res.status(400).json({ message: "Invalid ID" });
  }

  if (!allowedStatus.includes(status)) {
    return res.status(400).json({
      message: "Invalid status value",
      allowed: allowedStatus,
    });
  }

  try {
    const [result] = await db
      .promise()
      .query(
        "UPDATE contact_us SET status = ? WHERE id = ?",
        [status, id]
      );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Message not found" });
    }

    res.status(200).json({
      message: "Status updated successfully",
      status,
    });
  } catch (error) {
    console.error("Status update error:", error);
    res.status(500).json({ message: "Database error" });
  }
};