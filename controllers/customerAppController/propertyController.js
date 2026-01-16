import moment from "moment";
import db from "../../config/dbconnect.js";
import fs from "fs";
import path from "path";

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
  const userId = req.params.id;

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized Access" });
  }

  const sql = `SELECT properties.* FROM properties
               WHERE properties.customerid = ?
               ORDER BY properties.propertyid DESC`;
  db.query(sql, [userId], (err, result) => {
    if (err) {
      console.error("Error fetching properties:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    const formatted = result.map((row) => ({
      ...row,
      created_at: moment(row.created_at).format("DD MMM YYYY | hh:mm A"),
      updated_at: moment(row.updated_at).format("DD MMM YYYY | hh:mm A"),
    }));

    // console.log(formatted);

    res.json(formatted);
  });
};


export const addProperty = (req, res) => {
  try {
    const {
      property_type,
      property_name,
      price,
      ownername,
      contact,
      areas,
      ofprice,
      state,
      city,
      address,
      customerid,
    } = req.body;

    console.log("Request Body:", req.body);
    console.log("Files:", req.files);

    db.query(
      "SELECT propertyid FROM properties WHERE propertyName = ?",
      [property_name],
      (err, result) => {
        if (err) {
          console.log("Check property error:", err);
          return res.status(500).json({
            success: false,
            message: "Database error",
          });
        }

        if (result.length > 0) {
          console.log("Duplicate property name:", property_name);
          return res.status(409).json({
            success: false,
            message: "Property name already exists",
          });
        }

        let parsedAreas = [];

        if (typeof areas === "string") {
          parsedAreas = JSON.parse(areas);
        } else if (Array.isArray(areas)) {
          parsedAreas = areas;
        }

        console.log("Parsed areas:", parsedAreas);

        const builtUpArea =
          parsedAreas.find((a) => a.label?.toLowerCase().includes("built-up"))
            ?.value || null;

        const carpetArea =
          parsedAreas.find((a) => a.label?.toLowerCase().includes("carpet"))
            ?.value || null;

        console.log("Built-up area:", builtUpArea);
        console.log("Carpet area:", carpetArea);

        const mapFiles = (field) => {
          if (req.files && req.files[field]) {
            return JSON.stringify(
              req.files[field].map((f) => `/uploads/${f.filename}`)
            );
          }
          return null;
        };

        const frontView = mapFiles("frontView");
        const sideView = mapFiles("sideView");
        const kitchenView = mapFiles("kitchenView");
        const hallView = mapFiles("hallView");
        const bedroomView = mapFiles("bedroomView");
        const bathroomView = mapFiles("bathroomView");
        const balconyView = mapFiles("balconyView");
        const nearestLandmark = mapFiles("nearestLandmark");
        const developedAmenities = mapFiles("developedAmenities");

        console.log("Images:", {
          frontView,
          sideView,
          kitchenView,
          hallView,
          bedroomView,
          bathroomView,
          balconyView,
          nearestLandmark,
          developedAmenities,
        });

        const seoSlug = toSlug(property_name);
        console.log("SEO Slug:", seoSlug);

        const insertSQL = `
          INSERT INTO properties
          (
            customerid,
            propertyType,
            propertyCategory,
            propertyName,
            totalSalesPrice,
            totalOfferPrice,
            contact,
            projectBy,
            state,
            city,
            address,
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
            created_at,
            updated_at
          )
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())
        `;

        const values = [
          customerid,
          property_type,
          property_type,
          property_name,
          price,
          ofprice,
          contact,
          ownername,
          state,
          city,
          address,
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

        console.log("Insert values:", values);

        db.query(insertSQL, values, (err, result) => {
          if (err) {
            console.log("Insert error:", err);
            return res.status(500).json({
              success: false,
              message: "Insert failed",
            });
          }

          console.log("Insert success:", result);

          return res.status(201).json({
            success: true,
            message: "Property added successfully",
            id: result.insertId,
          });
        });
      }
    );
  } catch (error) {
    console.log("Unhandled error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const updateProperty = (req, res) => {
  try {
    const { propertyid } = req.params;

    const {
      property_type,
      property_name,
      price,
      ownername,
      contact,
      areas,
      ofprice,
      state,
      city,
    } = req.body;
    console.log(req.body);
    if (!propertyid) {
      return res.status(400).json({ message: "Property ID is required" });
    }

    // -------------------------------------------------
    // 1️⃣ CHECK PROPERTY NAME (EXCEPT CURRENT)
    // -------------------------------------------------
    db.query(
      `SELECT propertyid FROM properties 
       WHERE propertyName = ? AND propertyid != ?`,
      [property_name, propertyid],
      (err, exists) => {
        if (err) {
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }

        if (exists.length > 0) {
          return res
            .status(409)
            .json({ message: "Property name already exists!" });
        }

        // -------------------------------------------------
        // 2️⃣ PARSE AREAS
        // -------------------------------------------------
        let parsedAreas = [];

        if (typeof areas === "string") parsedAreas = JSON.parse(areas);
        else if (Array.isArray(areas)) parsedAreas = areas;

        const builtUpArea =
          parsedAreas.find((a) => a.label.toLowerCase().includes("built-up"))
            ?.value || null;

        const carpetArea =
          parsedAreas.find((a) => a.label.toLowerCase().includes("carpet"))
            ?.value || null;

        // -------------------------------------------------
        // 3️⃣ IMAGE MAPPING (ONLY UPDATE IF SENT)
        // -------------------------------------------------
        const mapFiles = (field) => {
          if (req.files && req.files[field]) {
            return JSON.stringify(
              req.files[field].map((f) => `/uploads/${f.filename}`)
            );
          }
          return undefined;
        };

        const images = {
          frontView: mapFiles("frontView"),
          sideView: mapFiles("sideView"),
          kitchenView: mapFiles("kitchenView"),
          hallView: mapFiles("hallView"),
          bedroomView: mapFiles("bedroomView"),
          bathroomView: mapFiles("bathroomView"),
          balconyView: mapFiles("balconyView"),
          nearestLandmark: mapFiles("nearestLandmark"),
          developedAmenities: mapFiles("developedAmenities"),
        };

        // -------------------------------------------------
        // 4️⃣ SEO SLUG
        // -------------------------------------------------
        const seoSlug = toSlug(property_name);

        // -------------------------------------------------
        // 5️⃣ DYNAMIC UPDATE QUERY
        // -------------------------------------------------
        let updateSQL = `
          UPDATE properties SET
            propertyType = ?,
            propertyCategory = ?,
            propertyName = ?,
            totalSalesPrice = ?,
            totalOfferPrice = ?,
            contact = ?,
            projectBy = ?,
            state = ?,
            city = ?,
            builtUpArea = ?,
            carpetArea = ?,
            seoSlug = ?,
            updated_at = NOW()
        `;

        const values = [
          property_type,
          property_type,
          property_name,
          price,
          ofprice,
          contact,
          ownername,
          state,
          city,
          builtUpArea,
          carpetArea,
          seoSlug,
        ];

        // -------------------------------------------------
        // 6️⃣ CONDITIONAL IMAGE UPDATE
        // -------------------------------------------------
        Object.entries(images).forEach(([key, value]) => {
          if (value !== undefined) {
            updateSQL += `, ${key} = ?`;
            values.push(value);
          }
        });

        updateSQL += ` WHERE propertyid = ?`;
        values.push(propertyid);

        // -------------------------------------------------
        // 7️⃣ EXECUTE UPDATE
        // -------------------------------------------------
        db.query(updateSQL, values, (err, result) => {
          if (err) {
            console.error("Update error:", err);
            return res
              .status(500)
              .json({ message: "Update failed", error: err });
          }

          if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Property not found" });
          }

          return res.status(200).json({
            message: "Property updated successfully",
            propertyid,
          });
        });
      }
    );
  } catch (error) {
    console.error("Update error:", error);
    return res.status(500).json({ message: "Server error", error });
  }
};
//**Change status */
export const status = (req, res) => {
  const Id = parseInt(req.params.id);
  console.log(Id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Property ID" });
  }

  db.query(
    "SELECT * FROM properties WHERE propertyid = ?",
    [Id],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      let status = "";
      if (result[0].status === "Active") {
        status = "Inactive";
      } else {
        status = "Active";
      }
      console.log(status);
      db.query(
        "UPDATE properties SET status = ? WHERE propertyid = ?",
        [status, Id],
        (err, result) => {
          if (err) {
            console.error("Error deleting :", err);
            return res
              .status(500)
              .json({ message: "Database error", error: err });
          }
          res
            .status(200)
            .json({ message: "Property status change successfully" });
        }
      );
    }
  );
};
export const del = (req, res) => {
  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Property ID" });
  }
  console.log("ddd");

  const imageFields = [
    "frontView",
    "sideView",
    "kitchenView",
    "hallView",
    "bedroomView",
    "bathroomView",
    "balconyView",
    "nearestLandmark",
    "developedAmenities",
  ];

  // Fetch all image paths from DB
  db.query(
    `SELECT ${imageFields.join(", ")} FROM properties WHERE propertyid = ?`,
    [Id],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      if (result.length === 0) {
        return res.status(404).json({ message: "Property not found" });
      }

      const property = result[0];

      // Loop through image fields and delete each image
      imageFields.forEach((field) => {
        if (property[field]) {
          try {
            const paths = JSON.parse(property[field]);
            if (Array.isArray(paths)) {
              paths.forEach((imgPath) => {
                const fullPath = path.join(process.cwd(), imgPath);
                fs.unlink(fullPath, (err) => {
                  if (err && err.code !== "ENOENT") {
                    console.error(`Error deleting ${imgPath}:`, err);
                  }
                });
              });
            }
          } catch (e) {
            console.error(`Failed to parse ${field}:`, e);
          }
        }
      });

      // Delete the property from DB
      db.query("DELETE FROM properties WHERE propertyid = ?", [Id], (err) => {
        if (err) {
          console.error("Error deleting property:", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }

        res.status(200).json({
          message: "Property and associated images deleted successfully",
        });
      });
    }
  );
};

