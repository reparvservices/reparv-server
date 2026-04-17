import db from "#db";

export const getAllBooking = (req, res) => {
  const tid = parseInt(req.params.id);

  const sql = `
    SELECT
      b.bookingid,
      b.enquirersid,
      b.amount,
      b.status,
      
      e.propertyid,
      e.customer,
      e.contact,
      e.territorypartnerid,
      
      s.fullname,
      p.propertyName
    FROM 
      bookings b
    LEFT JOIN 
      enquirers e ON b.enquirersid = e.enquirersid
    LEFT JOIN 
      territorypartner s ON e.territorypartnerid = s.id
    LEFT JOIN 
      properties p ON e.propertyid = p.propertyid
    WHERE 
      e.territorypartnerid = ?
    ORDER BY 
      b.bookingid DESC;
  `;

  db.query(sql, [tid], (err, result) => {
    if (err) {
      console.error("Error to found booking:", err);
      return res.status(500).json({ message: "Database error", error: err });

      console.log(error);
    }
    console.log(result);

    res.json(result);
  });
};
