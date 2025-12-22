import db from "../../config/dbconnect.js";
import moment from "moment";

/* =======================
   GET ALL BY LOCATION
======================= */
export const getAllWithLocation = (req, res) => {
  const { location } = req.params;

  if (!location) {
    return res.status(400).json({ message: "Location not provided" });
  }

  const sql = "SELECT * FROM faq WHERE location = ? ORDER BY type";

  db.query(sql, [location], (err, result) => {
    if (err) {
      console.error("Error fetching FAQs:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    return res.status(200).json(result);
  });
};

/* =======================
   GET ALL ACTIVE BY LOCATION
======================= */
export const getAllActive = (req, res) => {
  const { location } = req.params;

  if (!location) {
    return res.status(400).json({ message: "Location not provided" });
  }

  const sql =
    "SELECT * FROM faq WHERE status = 'Active' AND location = ? ORDER BY type";

  db.query(sql, [location], (err, result) => {
    if (err) {
      console.error("Error fetching active FAQs:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    return res.status(200).json(result);
  });
};

/* =======================
   GET ALL ACTIVE For Blog BY By Id
======================= */
export const getAllActiveForBlog = (req, res) => {
  const blogId = req.params.id;

  if (!blogId) {
    return res.status(400).json({ message: "Blog Id not provided" });
  }

  const sql =
    "SELECT * FROM faq WHERE status = 'Active' AND blogId = ? ORDER BY type";

  db.query(sql, [blogId], (err, result) => {
    if (err) {
      console.error("Error fetching active FAQs:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    return res.status(200).json(result);
  });
};

/* =======================
   GET ALL (ADMIN)
======================= */
export const getAll = (req, res) => {
  const sql = "SELECT * FROM faq WHERE blogId is NULL ORDER BY id DESC";

  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching FAQs:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    return res.status(200).json(result);
  });
};

/* =======================
   GET ALL For Blog (Admin Blogs)
======================= */
export const getAllForBlog = (req, res) => {
  const blogId = req.params.id;
  if (!blogId) {
    return res.status(401).json({ message: "BlogId Not Provided!" });
  }
  const sql = "SELECT * FROM faq WHERE blogId = ? ORDER BY id DESC";

  db.query(sql, [blogId], (err, result) => {
    if (err) {
      console.error("Error fetching FAQs:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    return res.status(200).json(result);
  });
};

/* =======================
   GET BY ID
======================= */
export const getById = (req, res) => {
  const id = Number(req.params.id);

  if (isNaN(id)) {
    return res.status(400).json({ message: "Invalid FAQ ID" });
  }

  db.query("SELECT * FROM faq WHERE id = ?", [id], (err, result) => {
    if (err) {
      console.error("Error fetching FAQ:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (result.length === 0) {
      return res.status(404).json({ message: "FAQ not found" });
    }

    return res.status(200).json(result[0]);
  });
};

/* =======================
   ADD FAQ
======================= */
export const add = (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const { blogId, location, type, question, answer } = req.body;

  if (!blogId || !location || !type || !question || !answer) {
    return res.status(400).json({
      message: "Location, type, question, and answer are required",
    });
  }

  const sql = `
    INSERT INTO faq
    (blogId, location, type, question, answer, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'Active', ?, ?)
  `;

  db.query(
    sql,
    [blogId, location, type, question, answer, currentdate, currentdate],
    (err, result) => {
      if (err) {
        console.error("Error adding FAQ:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      return res.status(201).json({
        message: "FAQ added successfully",
        faqId: result.insertId,
      });
    }
  );
};

/* =======================
   UPDATE FAQ
======================= */
export const update = (req, res) => {
  const id = Number(req.params.id);
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const { location, type, question, answer } = req.body;

  if (isNaN(id) || !location || !type || !question || !answer) {
    return res.status(400).json({ message: "All fields are required" });
  }

  const sql = `
    UPDATE faq SET
      location = ?,
      type = ?,
      question = ?,
      answer = ?,
      updated_at = ?
    WHERE id = ?
  `;

  db.query(
    sql,
    [location, type, question, answer, currentdate, id],
    (err, result) => {
      if (err) {
        console.error("Error updating FAQ:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "FAQ not found" });
      }

      return res.status(200).json({ message: "FAQ updated successfully" });
    }
  );
};

/* =======================
   TOGGLE STATUS
======================= */
export const status = (req, res) => {
  const id = Number(req.params.id);

  if (isNaN(id)) {
    return res.status(400).json({ message: "Invalid ID" });
  }

  db.query("SELECT status FROM faq WHERE id = ?", [id], (err, result) => {
    if (err) {
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (result.length === 0) {
      return res.status(404).json({ message: "FAQ not found" });
    }

    const newStatus = result[0].status === "Active" ? "Inactive" : "Active";

    db.query(
      "UPDATE faq SET status = ? WHERE id = ?",
      [newStatus, id],
      (err) => {
        if (err) {
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }

        return res.status(200).json({
          message: "Status updated successfully",
          status: newStatus,
        });
      }
    );
  });
};

/* =======================
   DELETE FAQ
======================= */
export const del = (req, res) => {
  const id = Number(req.params.id);

  if (isNaN(id)) {
    return res.status(400).json({ message: "Invalid ID" });
  }

  db.query("DELETE FROM faq WHERE id = ?", [id], (err, result) => {
    if (err) {
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "FAQ not found" });
    }

    return res.status(200).json({ message: "FAQ deleted successfully" });
  });
};
