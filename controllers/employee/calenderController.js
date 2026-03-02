import db from "../../config/dbconnect.js";
import moment from "moment-timezone";

//Fetch All
export const getAll = (req, res) => {
  const projectPartnerId = req.employeeUser?.projectpartnerid;

  if (!projectPartnerId) {
    return res.status(401).json({
      message: "Unauthorized Access — Employee is not linked to any Project Partner.",
    });
  }
  const sql = `SELECT propertyfollowup.*,
                      properties.propertyName,
                      enquirers.customer,
                      enquirers.contact,
                      salespersons.fullname
               FROM propertyfollowup 
               INNER JOIN enquirers ON propertyfollowup.enquirerid = enquirers.enquirersid
               INNER JOIN properties ON enquirers.propertyid = properties.propertyid
               LEFT JOIN salespersons ON enquirers.salespersonid = salespersons.salespersonsid
               WHERE properties.projectpartnerid = ?
               ORDER BY propertyfollowup.followupid DESC`; 

  db.query(sql, [projectPartnerId], (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res.json(result);
  });
};
