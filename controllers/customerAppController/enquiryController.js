import moment from "moment";
import db from "../../config/dbconnect.js";

export const add = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");

  const {
    user_id,
    propertyid,
    fullname,
    phone,
  } = req.body;
  console.log(req.body);

  //  Required field validation (visitdate removed)
  if (
    !user_id ||
    !propertyid ||
    !fullname ||
    !phone
  ) {
    return res
      .status(400)
      .json({ message: "All fields except visitdate are required" });
  }

  // 1️⃣ Fetch property category
  const categorySQL = `SELECT propertyCategory FROM properties WHERE propertyid = ?`;

  db.query(categorySQL, [propertyid], (err, results) => {
    if (err) {
      console.error("Error fetching property category:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "Property not found" });
    }

    const propertyCategory = results[0].propertyCategory;

    // 2️⃣ Insert enquiry
    const insertSQL = `
      INSERT INTO enquirers (
        propertyid,
        category,
        customer,
        contact,
        source,
        updated_at,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(
      insertSQL,
      [
        propertyid,
        propertyCategory,
        fullname,
        phone,
        "Onsite",
        currentdate,
        currentdate,
      ],
      (err, result) => {
        if (err) {
          console.error("Error inserting enquiry:", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }

        // 3️⃣ Remove from wishlist if exists
        const deleteWishlistSql = `
          DELETE FROM user_property_wishlist 
          WHERE user_id = ? AND property_id = ?
        `;

        db.query(deleteWishlistSql, [user_id, propertyid], (delErr) => {
          if (delErr) {
            console.error("Error auto-removing from wishlist:", delErr);
            // Don't block success if wishlist delete fails
          }

          //  Final success response
          res.status(201).json({
            message: "Enquiry added successfully",
            Id: result.insertId,
            propertyCategory,
          });
        });
      }
    );
  });
};

export const getAll = (req, res) => {
  const { contact } = req.query;
  // Validate contact
  if (!contact || !contact.trim()) {
    return res.status(400).json({
      message: "Please provide a valid contact number",
    });
  }
  const sql = `
    SELECT enquirers.*,properties.propertyName,properties.seoSlug, properties.frontView, properties.totalOfferPrice,properties.totalSalesPrice,properties.emi,properties.propertyCategory,
    properties.city,properties.location,properties.propertyApprovedBy,properties.distanceFromCityCenter,
    territorypartner.fullname AS territoryName,
    territorypartner.contact AS territoryContact
    FROM enquirers 
    LEFT JOIN properties 
    ON enquirers.propertyid = properties.propertyid
    LEFT JOIN territorypartner ON territorypartner.id = enquirers.territorypartnerid 
    WHERE enquirers.contact = ? 
    ORDER BY enquirers.enquirersid DESC`;

  db.query(sql, [contact.trim()], (err, results) => {
    if (err) {
      console.error("Database Query Error:", err);
      return res
        .status(500)
        .json({ message: "Database query error", error: err });
    }
    const formatted = results.map((row) => ({
      ...row,
      created_at: moment(row.created_at).format("DD MMM YYYY | hh:mm A"),
      updated_at: moment(row.updated_at).format("DD MMM YYYY | hh:mm A"),
    }));

    res.status(200).json({
      message: "Fetched successfully",
      data: formatted,
    });
  });
};

//Fetch only Visit Enquiry
export const getVisitsOnly = (req, res) => {
  const { contact, fullname } = req.query;

  //Validate required query parameters
  if (!contact) {
    return res.status(400).json({
      message: "Please provide contact !",
    });
  }

  //  Get visit records with visitdate and status
  const sql = `
    SELECT 
      enquirers.*, 
     properties.propertyName,properties.seoSlug, properties.frontView, properties.totalOfferPrice,properties.totalSalesPrice,properties.emi,properties.propertyCategory,
    properties.city,properties.location,properties.propertyApprovedBy,properties.distanceFromCityCenter
    FROM enquirers 
    LEFT JOIN properties ON enquirers.propertyid = properties.propertyid
    WHERE enquirers.contact = ? 
      AND enquirers.visitdate IS NOT NULL 
      AND enquirers.status = 'Visit Scheduled'
    ORDER BY enquirers.enquirersid DESC
  `;

  db.query(sql, [contact], (err, results) => {
    if (err) {
      console.error("Database Query Error:", err);
      return res.status(500).json({
        message: "Database query error",
        error: err,
      });
    }

    //Format created_at and updated_at
    const formatted = results.map((row) => ({
      ...row,
      created_at: moment(row.created_at).format("DD MMM YYYY | hh:mm A"),
      updated_at: moment(row.updated_at).format("DD MMM YYYY | hh:mm A"),
    }));

    return res.json({
      message: "Visits fetched successfully",
      data: formatted,
    });
  });
};

export const getBookingOnly = (req, res) => {
  const { contact } = req.query;
  console.log(contact);
  if (!contact) {
    console.log("Invalid User Id: " + contact);
    return res.status(400).json({ message: "Invalid User Id" });
  }
  const sql = `
    SELECT 
      enquirers.*, 
      properties.frontView,
      properties.seoSlug,
      properties.commissionType,
      properties.commissionAmount,
      properties.commissionPercentage,
      territorypartner.fullname AS territoryName, 
      territorypartner.contact AS territoryContact,
      propertyfollowup.*
    FROM enquirers 
    LEFT JOIN properties ON enquirers.propertyid = properties.propertyid
    LEFT JOIN territorypartner ON enquirers.territorypartnerid = territorypartner.id
    LEFT JOIN propertyfollowup ON propertyfollowup.enquirerid = enquirers.enquirersid
    WHERE enquirers.status = 'Token' AND propertyfollowup.status = 'Token' AND enquirers.contact= ?
    ORDER BY propertyfollowup.created_at DESC
  `;

  db.query(sql, [contact], (err, result) => {
    if (err) {
      console.error("Error fetching :", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    const formatted = result.map((row) => ({
      ...row,
      created_at: moment(row.created_at).format("DD MMM YYYY | hh:mm A"),
      updated_at: moment(row.updated_at).format("DD MMM YYYY | hh:mm A"),
    }));

    return res.json(formatted);
  });
};


export const addLeadNotification = (req, res) => {
  try {
    const { fullname, contact, message } = req.body;
    const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");

    // Validation
    if (!fullname || !contact || !message) {
      return res.status(400).json({
        message: "Full name, contact and message are required.",
        status: false,
      });
    }

    // Insert Query
    const query = `
      INSERT INTO userenquiry
      (fullname, contact, message)
      VALUES (?, ?, ?)
    `;

    db.query(
      query,
      [fullname, contact, message],
      (err, result) => {
        if (err) {
          console.log("Lead Notify Insert Error:", err);
          return res.status(500).json({
            message: "Database Error",
            status: false,
            error: err,
          });
        }

        return res.status(200).json({
          message: "Notification request saved successfully!",
          status: true,
        });
      }
    );
  } catch (error) {
    console.log("Lead Notify Error:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      status: false,
      error,
    });
  }
};
