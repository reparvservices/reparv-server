import db from "#db";

export const bookProperty = (req, res) => {
  const { enquiryid, propertyinfoid, amount, paymentid } = req.body;

  if ( !amount || !paymentid) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const sql = `
      INSERT INTO bookings (enquirersid, propertyinfoid, amount, paymentid)
      VALUES (?, ?, ?, ?)
    `;

  db.query(
    sql,
    [enquiryid, propertyinfoid, amount, paymentid],
    (err, result) => {
      if (err) {
        console.error("Error saving booking:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      res.status(201).json({
        message: "Booking saved",
        bookingid: result.insertId,
      });
    }
  );
};

export const getAllBooking = (req, res) => {
  const sid = parseInt(req.params.id);

  console.log(sid);

  const sql = `
  SELECT
    b.bookingid,
    b.enquirersid,
    b.amount,
    b.status,
    
    e.propertyid,
    e.customer,
    e.contact,
    e.salespersonid,
    
    s.fullname,
    p.propertyName
  FROM 
    bookings b
  LEFT JOIN 
    enquirers e ON b.enquirersid = e.enquirersid
  LEFT JOIN 
    salespersons s ON e.salespersonid = s.salespersonsid
  LEFT JOIN 
    properties p ON e.propertyid = p.propertyid
  WHERE 
    e.salespersonid = ?
  ORDER BY 
    b.bookingid DESC;
`;

  db.query(sql, [sid], (err, result) => {
    if (err) {
      console.error("Error to found booking:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    res.json(result);
  });
};
