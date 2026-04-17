import db from "#db";

// **Fetch city by state ID`
export const getById = (req, res) => {
  const Id = req.params.id;
  const sql = "SELECT * FROM cities WHERE stateId = ? ORDER BY city";

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "City not found" });
    }
    res.json(result);
  });
};