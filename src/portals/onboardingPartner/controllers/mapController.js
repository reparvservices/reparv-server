import db from "#db";
import moment from "moment-timezone";

// ** Fetch All Unique City In The Listed Property **
export const getAllCity = (req, res) => {
  const ID = req.onboardingUser?.id;
  if (!ID) {
    return res
      .status(400)
      .json({ message: "Unauthorized, Please Login Again!" });
  }
  const sql = `
    SELECT DISTINCT city 
    FROM properties 
    WHERE properties.partnerid = ? 
    ORDER BY city
  `;
  db.query(sql, [ID], (err, result) => {
    if (err) {
      console.error("Error fetching:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    // Return array of strings instead of array of objects
    res.json(result.map((row) => row.city));
  });
};

// **Fetch All Properties City Wise **
export const getCityWiseProperties = (req, res) => {
  const ID = req.onboardingUser?.id;
  if (!ID) {
    return res
      .status(400)
      .json({ message: "Unauthorized, Please Login Again!" });
  }
  const propertyCity = req.params.city;

  let sql;
  let params = [];
  if (propertyCity) {
    sql = `
      SELECT properties.*, builders.company_name 
      FROM properties 
      INNER JOIN builders ON properties.builderid = builders.builderid 
      WHERE properties.city = ? AND properties.partnerid = ?
      ORDER BY properties.created_at DESC
    `;
    params.push(propertyCity);
    params.push(ID);
  } else {
    sql = `
      SELECT properties.*, builders.company_name 
      FROM properties 
      INNER JOIN builders ON properties.builderid = builders.builderid 
      ORDER BY properties.created_at DESC
    `;
  }

  db.query(sql, params, (err, result) => {
    if (err) {
      console.error("Error fetching properties:", err);
      return res
        .status(500)
        .json({ success: false, message: "Database error" });
    }

    const formatted = result.map((row) => ({
      ...row,
      created_at: row.created_at
        ? moment.utc(row.created_at).tz("Asia/Kolkata").format("DD MMM YYYY | hh:mm A")
        : null,
      updated_at: row.updated_at
        ? moment.utc(row.updated_at).tz("Asia/Kolkata").format("DD MMM YYYY | hh:mm A")
        : null,
    }));

    res.json(formatted);
  });
};
