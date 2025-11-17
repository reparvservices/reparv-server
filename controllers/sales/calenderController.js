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
               LEFT JOIN enquirers ON propertyfollowup.enquirerid = enquirers.enquirersid
               LEFT JOIN properties ON enquirers.propertyid = properties.propertyid
               LEFT JOIN salespersons ON enquirers.salespersonid = salespersons.salespersonsid
               WHERE enquirers.salespersonid = ? 
               ORDER BY propertyfollowup.followupid DESC`;

  db.query(sql, [req.salesUser.id], (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res.json(result);
  });
};

/* Change status */
export const changeStatus = (req, res) => {
  const { status } = req.body;
  if (status === "") {
    return res.status(400).json({ message: "Please Select Status!" });
  }

  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid ID" });
  }

  db.query(
    "SELECT * FROM propertyfollowup WHERE followupid = ? AND changestatus = 0",
    [Id],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      db.query(
        "UPDATE propertyfollowup SET status = ?, changestatus = 1 WHERE followupid = ?  AND changestatus = 0 ",
        [status, Id],
        (err, result) => {
          if (err) {
            console.error("Error changing status :", err);
            return res
              .status(500)
              .json({ message: "Database error", error: err });
          }
          res.status(200).json({ message: "status change successfully" });
        }
      );
    }
  );
};

export const getNotes = (req, res) => {
  try {
    const userId = req.salesUser.id;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized Access, Please Login Again!",
      });
    }

    const { date } = req.query;

    let sql = "SELECT * FROM calenderNotes WHERE salesPartnerId = ?";
    let values = [userId];

    if (date) {
      sql += " AND date = ?";
      values.push(date);
    }

    sql += " ORDER BY date DESC, created_at DESC";

    db.query(sql, values, (err, result) => {
      if (err) {
        console.error("Error fetching notes:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      const formatted = result.map((row) => ({
        ...row,
        created_at: moment(row.created_at).format("DD MMM YYYY | hh:mm A"),
        date: moment(row.date).format(date, "yyyy-MM-dd"),
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
    const userId = req.salesUser.id;
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
      "INSERT INTO calenderNotes (salesPartnerId, date, time, note) VALUES (?, ?, ?, ?)",
      [userId, date, time, note], 
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
    const userId = req.salesUser.id;
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
      "DELETE FROM calenderNotes WHERE id = ? AND salesPartnerId = ?",
      [noteid, userId],
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
