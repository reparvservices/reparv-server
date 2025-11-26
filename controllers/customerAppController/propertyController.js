import moment from "moment";
import db from "../../config/dbconnect.js";


function toSlug(text) {
  return text
    .toLowerCase() // Convert to lowercase
    .trim() // Remove leading/trailing spaces
    .replace(/[^a-z0-9\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-"); // Replace multiple hyphens with single
}
export const addInWishList = (req, res) => {
  try {
    const { user_id, property_id } = req.body;
    const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
    // Input validation
    if (!user_id || !property_id) {
      return res.status(400).json({ message: "Login Please !" });
    }

    // Check if already exists
    const checkSql = `SELECT * FROM user_property_wishlist WHERE user_id = ? AND property_id = ?`;
    db.query(checkSql, [user_id, property_id], (checkErr, checkResult) => {
      if (checkErr) {
        console.error("Error checking wishlist:", checkErr);
        return res
          .status(500)
          .json({ message: "Database error", error: checkErr });
      }

      if (checkResult.length > 0) {
        return res.status(409).json({ message: "Already added to wishlist!" });
      }

      // If not exists, then insert updated_at, created_at
      const insertSql = `INSERT INTO user_property_wishlist (user_id, property_id,updated_at,created_at) VALUES (?, ?,?,?)`;
      db.query(
        insertSql,
        [user_id, property_id, currentdate, currentdate],
        (insertErr, insertResult) => {
          if (insertErr) {
            console.error("Error adding to wishlist:", insertErr);
            return res
              .status(500)
              .json({ message: "Database error", error: insertErr });
          }

          res.status(201).json({ message: "Successfully Added!" });
        }
      );
    });
  } catch (error) {
    console.error("Unexpected error in addInWishList:", error);
    res.status(500).json({ message: "Internal server error", error });
  }
};

export const getUserWishlist = (req, res) => {
  try {
    const { user_id } = req.params;

    if (!user_id) {
      return res.status(400).json({ message: "User ID is required!" });
    }

    const sql = `
      SELECT p.*
      FROM user_property_wishlist uw
      INNER JOIN properties p ON uw.property_id = p.propertyid
      WHERE uw.user_id = ?
    `;

    db.query(sql, [user_id], (err, result) => {
      if (err) {
        console.error("Error fetching wishlist:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      res.status(200).json({
        message: "Wishlist fetched successfully!",
        data: result,
      });
    });
  } catch (error) {
    console.error("Unexpected error in getUserWishlist:", error);
    res.status(500).json({ message: "Internal server error", error });
  }
};

// **Fetch All Properties**
export const getAll = (req, res) => {
  const userContact= req.params.contact;
  if (!userContact) {
    return res.status(401).json({ message: "Unauthorized Access" });
  }
  const sql = `SELECT properties.* FROM properties
               WHERE properties.contact = ?
               ORDER BY properties.propertyid DESC`;
  db.query(sql,[userContact], (err, result) => {
    if (err) {
      console.error("Error fetching properties:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    const formatted = result.map((row) => ({
      ...row,
      created_at: moment(row.created_at).format("DD MMM YYYY | hh:mm A"),
      updated_at: moment(row.updated_at).format("DD MMM YYYY | hh:mm A"),
    }));

    console.log(formatted);
    
    res.json(formatted);
  });
};

export const addProperty = (req, res) => {
  try {
    const {
      property_type,
      property_name,
      price,
      contact,
      areas,
      state,
      city,
      pincode,
      address,
      ownership
    } = req.body;

    console.log(req.body);

    // -----------------------------------------
    // 1️⃣ CHECK IF PROPERTY NAME ALREADY EXISTS
    // -----------------------------------------
    db.query(
      "SELECT propertyid FROM properties WHERE propertyName = ?",
      [property_name],
      (err, result) => {
        if (err) {
          return res.status(500).json({ message: "Database error", error: err });
        }

        if (result.length > 0) {
          return res.status(409).json({
            message: "Property name already exists!",
          });
        }

        // -----------------------------------------
        // 2️⃣ PARSE AREAS
        // -----------------------------------------
        let parsedAreas = [];

        if (typeof areas === "string") parsedAreas = JSON.parse(areas);
        else if (Array.isArray(areas)) parsedAreas = areas;

        const builtUpArea =
          parsedAreas.find(a => a.label.toLowerCase().includes("built-up"))
            ?.value || null;

        const carpetArea =
          parsedAreas.find(a => a.label.toLowerCase().includes("carpet"))
            ?.value || null;

        // -----------------------------------------
        // 3️⃣ MAP UPLOADED IMAGES
        // -----------------------------------------
        const mapUploadedFiles = (field) => {
          if (req.files[field]) {
            return JSON.stringify(
              req.files[field].map(f => `/uploads/${f.filename}`)
            );
          }
          return null;
        };

        const frontView = mapUploadedFiles("frontView");
        const sideView = mapUploadedFiles("sideView");
        const kitchenView = mapUploadedFiles("kitchenView");
        const hallView = mapUploadedFiles("hallView");
        const bedroomView = mapUploadedFiles("bedroomView");
        const bathroomView = mapUploadedFiles("bathroomView");
        const balconyView = mapUploadedFiles("balconyView");
        const nearestLandmark = mapUploadedFiles("nearestLandmark");
        const developedAmenities = mapUploadedFiles("developedAmenities");

        // -----------------------------------------
        // 4️⃣ SEO SLUG
        // -----------------------------------------
        const seoSlug = toSlug(property_name);

        // -----------------------------------------
        // 5️⃣ INSERT INTO DB
        // -----------------------------------------
        const insertSQL = `
          INSERT INTO properties
          (propertyType,propertyCategory, propertyName, totalOfferPrice, contact, state, city, pincode, address, ownershipType,
           builtUpArea, carpetArea, frontView, sideView, kitchenView, hallView, bedroomView, bathroomView, balconyView,
           nearestLandmark, developedAmenities, seoSlug, created_at, updated_at)
          VALUES (?,?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `;

        const values = [
          property_type,
          property_type,
          property_name,
          price,
          contact,
          state,
          city,
          pincode,
          address,
          ownership,
          builtUpArea,
          carpetArea,
          frontView,
          sideView,
          kitchenView,
          hallView,
          bedroomView,
          bathroomView,
          balconyView,
          nearestLandmark,
          developedAmenities,
          seoSlug,
        ];

        db.query(insertSQL, values, (err, result) => {
          if (err) {
            console.error("Insert error:", err);

            // Duplicate handling from DB constraint
            if (err.code === "ER_DUP_ENTRY") {
              return res.status(409).json({
                message: "Property name already exists!",
              });
            }

            return res.status(500).json({ message: "Insert failed", error: err });
          }

          return res.status(201).json({
            message: "Property added successfully",
            id: result.insertId,
          });
        });
      }
    );
  } catch (error) {
    console.error("Something went wrong:", error);
    return res.status(500).json({ message: "Server error", error });
  }
};

