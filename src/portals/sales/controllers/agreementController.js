import db from "#db";

export const acceptAgreement = (req, res) => {
  const { agreement } = req.body;

  const salespersonsid = parseInt(req.params.id);
  if (isNaN(salespersonsid)) {
    return res.status(400).json({ message: "Invalid Partner ID" });
  }

  if (!agreement) {
    return res.status(400).json({ message: "All fields are required" });
  }

  db.query(
    `UPDATE salespersons SET agreement = ?  WHERE salespersonsid = ?`,
    [agreement, salespersonsid],
    (updateErr, result) => {
      if (updateErr) {
        console.error("Error accepting agreement:", updateErr);
        return res
          .status(500)
          .json({ message: "Database error during update", error: updateErr });
      }

      res.status(200).json({ message: "Agreeement Accepted Successfully" });
    }
  );
};
