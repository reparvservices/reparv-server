import db from "../../config/dbconnect.js";
import moment from "moment";

//Fetch All
export const getAll = (req, res) => {
  const sql = `SELECT propertyfollowup.*,
                      properties.propertyName,
                      enquirers.customer,
                      enquirers.contact,
                      salespersons.fullname
               FROM propertyfollowup 
               INNER JOIN enquirers ON propertyfollowup.enquirerid = enquirers.enquirersid
               INNER JOIN properties ON enquirers.propertyid = properties.propertyid
               LEFT JOIN salespersons ON enquirers.salespersonid = salespersons.salespersonsid
               ORDER BY propertyfollowup.followupid DESC`;

  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res.json(result);
  });
};

export const getNotes = (req, res) => {
  try {
    const userId = req.adminUser?.id;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized Access, Please Login Again!",
      });
    }

    const { date } = req.query;

    // Base SQL + params array
    let sql = "SELECT * FROM calenderNotes WHERE salesPartnerId IS NULL AND territoryPartnerId IS NULL AND projectPartnerId IS NULL";
    let params = [];

    // Add date filter
    if (date) {
      sql += " AND date = ?";
      params.push(date);
    }

    sql += " ORDER BY date DESC, created_at DESC";

    db.query(sql, params, (err, result) => {
      if (err) {
        console.error("Error fetching notes:", err);
        return res
          .status(500)
          .json({ message: "Database error", error: err });
      }

      // Format results
      const formatted = result.map((row) => ({
        ...row,
        created_at: moment(row.created_at).format("DD MMM YYYY | hh:mm A"),
        date: moment(row.date).format("DD MMM YYYY"),
      }));

      res.json(formatted);
    });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Add a new note
export const addNote = (req, res) => {
  try {
    const userId = req.adminUser.id;
    if (!userId) {
      return res
        .status(401)
        .json({ message: "Unauthorized Access, Please Login Again!" });
    }

    const { date, time, note } = req.body;

    if (!date || !time || !note) {
      return res.status(400).json({ message: "Date and Note are required" });
    }

    db.query(
      "INSERT INTO calenderNotes (date, time, note) VALUES (?, ?, ?)",
      [date, time, note],
      (err, result) => {
        if (err) {
          console.error("Error adding note:", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }

        return res.status(200).json({
          message: "Note added successfully",
          noteid: result.insertId,
        });
      }
    );
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Delete a note
export const deleteNote = (req, res) => {
  try {
    const userId = req.adminUser.id;
    if (!userId) {
      return res
        .status(401)
        .json({ message: "Unauthorized Access, Please Login Again!" });
    }

    const noteid = req.params.id;

    if (!noteid) {
      return res.status(400).json({ message: "Note ID is required" });
    }

    db.query(
      "DELETE FROM calenderNotes WHERE id = ?",
      [noteid],
      (err, result) => {
        if (err) {
          console.error("Error deleting note:", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }

        if (result.affectedRows === 0) {
          return res.status(404).json({ message: "Note not found" });
        }

        return res.status(200).json({ message: "Note deleted successfully" });
      }
    );
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};
