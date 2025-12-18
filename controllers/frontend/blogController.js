import db from "../../config/dbconnect.js";
import moment from "moment";

// **Fetch All**
export const getAll = (req, res) => {
  const sql = "SELECT * FROM blogs WHERE status='Active' ORDER BY id DESC";
  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
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
  const seoSlug = req.params.slug;
  const sql = "SELECT * FROM blogs WHERE seoSlug = ?";
  db.query(sql, [seoSlug], (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Blog not found" });
    }
    const formatted = result.map((row) => ({
          ...row,
          created_at: moment(row.created_at).format("DD MMM YYYY | hh:mm A"),
          updated_at: moment(row.updated_at).format("DD MMM YYYY | hh:mm A"),
        }));
    
        res.json(formatted[0]);
  });
};

// **Add New **
export const addFeedback = (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const { feedbackType, fullname, contact, email, message } = req.body;
  
  if (!feedbackType || !fullname || !contact || !email || !message) {
    return res.status(400).json({ message: "All Fields are Required" });
  }

  const sql = `INSERT INTO blogfeedback (type, fullname, contact, email, message, created_at, updated_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?)`;

  db.query(
    sql,
    [feedbackType, fullname, contact, email, message, currentdate, currentdate],
    (err, result) => {
      if (err) {
        console.error("Error inserting Feedback:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      return res.status(201).json({
        message: "Feedback added successfully",
      });
    }
  );
};


