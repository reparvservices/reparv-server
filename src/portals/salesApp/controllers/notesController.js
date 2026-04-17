import db from "#db";



export const addNote = (req, res) => {
  const { projectPartnerId, salesPartnerId, territoryPartnerId, date, note,time } = req.body;
console.log(req.body);

  if (!date) return res.status(400).json({ message: "date is required" });
  if (!note || note.trim() === "") return res.status(400).json({ message: "note cannot be empty" });

  const sql = `
    INSERT INTO calenderNotes 
    (projectPartnerId, salesPartnerId, territoryPartnerId, date, note,time)
    VALUES (?, ?, ?, ?, ?,?)
  `;

  db.query(
    sql,
    [projectPartnerId || null, salesPartnerId || null, territoryPartnerId || null, date, note,time],
    (err, result) => {
      if (err) {
        console.error("Error inserting note:", err);
        return res.status(500).json({ message: "Internal server error" });
      }

      return res.status(200).json({
        message: "Note added successfully",
        noteId: result.insertId,
      });
    }
  );
};

/*-------------------------------------------------
    FETCH NOTES (All notes for a partner)
-------------------------------------------------*/
export const fetchNotes = (req, res) => {
  const { projectPartnerId, salesPartnerId, territoryPartnerId } = req.query;

  let sql = `SELECT * FROM calenderNotes WHERE 1=1`;
  const params = [];
console.log(req.query);

  if (projectPartnerId) {
    sql += ` AND projectPartnerId = ?`;
    params.push(projectPartnerId);
  }
  if (salesPartnerId) {
    sql += ` AND salesPartnerId = ?`;
    params.push(salesPartnerId);
  }
  if (territoryPartnerId) {
    sql += ` AND territoryPartnerId = ?`;
    params.push(territoryPartnerId);
  }

  sql += ` ORDER BY date ASC`;

  db.query(sql, params, (err, rows) => {
    if (err) {
      console.error("Error fetching notes:", err);
      return res.status(500).json({ message: "Internal server error" });
    }

    return res.status(200).json(rows);
  });
};

/*-------------------------------------------------
    FETCH NOTES BY DATE
-------------------------------------------------*/
export const fetchNotesByDate = (req, res) => {
  const { date, salesPartnerId, projectPartnerId, territoryPartnerId } = req.query;

  if (!date) return res.status(400).json({ message: "date is required" });

  let sql = `
    SELECT * FROM calenderNotes 
    WHERE date = ?
  `;
  const params = [date];

  if (salesPartnerId) {
    sql += ` AND salesPartnerId = ?`;
    params.push(salesPartnerId);
  }
  if (projectPartnerId) {
    sql += ` AND projectPartnerId = ?`;
    params.push(projectPartnerId);
  }
  if (territoryPartnerId) {
    sql += ` AND territoryPartnerId = ?`;
    params.push(territoryPartnerId);
  }

  db.query(sql, params, (err, rows) => {
    if (err) {
      console.error("Error fetching notes by date:", err);
      return res.status(500).json({ message: "Internal server error" });
    }

    return res.status(200).json(rows);
  });
};

/*-------------------------------------------------
    FETCH NOTES BY MONTH
-------------------------------------------------*/
export const fetchNotesByMonth = (req, res) => {
  const { month, year, salesPartnerId, projectPartnerId, territoryPartnerId } = req.query;

  if (!month || !year)
    return res.status(400).json({ message: "month and year are required" });

  let sql = `
    SELECT *
    FROM calenderNotes
    WHERE MONTH(date) = ? AND YEAR(date) = ?
  `;
  const params = [month, year];

  if (salesPartnerId) {
    sql += ` AND salesPartnerId = ?`;
    params.push(salesPartnerId);
  }
  if (projectPartnerId) {
    sql += ` AND projectPartnerId = ?`;
    params.push(projectPartnerId);
  }
  if (territoryPartnerId) {
    sql += ` AND territoryPartnerId = ?`;
    params.push(territoryPartnerId);
  }

  db.query(sql, params, (err, rows) => {
    if (err) {
      console.error("Error fetching by month:", err);
      return res.status(500).json({ message: "Internal server error" });
    }

    return res.status(200).json(rows);
  });
};

/*-------------------------------------------------
    UPDATE NOTE
-------------------------------------------------*/
export const updateNote = (req, res) => {
  const { id, note, date } = req.body;

  if (!id) return res.status(400).json({ message: "id is required" });
  if (!note || note.trim() === "") return res.status(400).json({ message: "note cannot be empty" });
  if (!date) return res.status(400).json({ message: "date is required" });

  const sql = `
    UPDATE calenderNotes
    SET note = ?, date = ?
    WHERE id = ?
  `;

  db.query(sql, [note, date, id], (err, result) => {
    if (err) {
      console.error("Error updating note:", err);
      return res.status(500).json({ message: "Internal server error" });
    }

    return res.status(200).json({ message: "Note updated successfully" });
  });
};

/*-------------------------------------------------
    DELETE NOTE
-------------------------------------------------*/
export const deleteNote = (req, res) => {
  const { id } = req.query;

  if (!id) return res.status(400).json({ message: "id is required" });

  const sql = `DELETE FROM calenderNotes WHERE id = ?`;

  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error("Error deleting note:", err);
      return res.status(500).json({ message: "Internal server error" });
    }

    return res.status(200).json({ message: "Note deleted successfully" });
  });
};
