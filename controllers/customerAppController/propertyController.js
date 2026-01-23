import moment from "moment";
import db from "../../config/dbconnect.js";
import fs from "fs";
import path from "path";
import { uploadToS3 } from "../../utils/imageUpload.js";

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


/* ---------- ADD PROPERTY ---------- */
export const addProperty = async (req, res) => {
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

    /*  Check duplicate property */
    db.query(
      "SELECT propertyid FROM properties WHERE propertyName = ?",
      [property_name],
      async (err, result) => {
        if (err)
          return res
            .status(500)
            .json({ success: false, message: "Database error" });

        if (result.length > 0) {
          return res.status(409).json({
            success: false,
            message: "Property name already exists",
          });
        }

        /*  Parse areas */
        let parsedAreas = [];
        if (typeof areas === "string") parsedAreas = JSON.parse(areas);
        if (Array.isArray(areas)) parsedAreas = areas;

        const builtUpArea =
          parsedAreas.find((a) =>
            a.label?.toLowerCase().includes("built-up")
          )?.value || null;

        const carpetArea =
          parsedAreas.find((a) =>
            a.label?.toLowerCase().includes("carpet")
          )?.value || null;

        /*  Upload images FIELD-WISE */
        const uploadField = async (field) => {
          if (!req.files || !req.files[field]) return [];
          const urls = [];
          for (const file of req.files[field]) {
            const url = await uploadToS3(file);
            urls.push(url);
          }
          return urls;
        };

        const frontView = await uploadField("frontView");
        const sideView = await uploadField("sideView");
        const kitchenView = await uploadField("kitchenView");
        const hallView = await uploadField("hallView");
        const bedroomView = await uploadField("bedroomView");
        const bathroomView = await uploadField("bathroomView");
        const balconyView = await uploadField("balconyView");
        const nearestLandmark = await uploadField("nearestLandmark");
        const developedAmenities = await uploadField("developedAmenities");


        console.log({          frontView,
          sideView,
          kitchenView,  });
        /*  Insert property */
        const insertSQL = `
          INSERT INTO properties (
            customerid, propertyType, propertyCategory, propertyName,
            totalSalesPrice, totalOfferPrice, contact, projectBy,
            state, city, address, builtUpArea, carpetArea,
            frontView, sideView, kitchenView, hallView,
            bedroomView, bathroomView, balconyView,
            nearestLandmark, developedAmenities,
            seoSlug, created_at, updated_at
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
          JSON.stringify(frontView),
          JSON.stringify(sideView),
          JSON.stringify(kitchenView),
          JSON.stringify(hallView),
          JSON.stringify(bedroomView),
          JSON.stringify(bathroomView),
          JSON.stringify(balconyView),
          JSON.stringify(nearestLandmark),
          JSON.stringify(developedAmenities),
          toSlug(property_name),
        ];

        db.query(insertSQL, values, (err, result) => {
          if (err) {
            console.error(err);
            return res
              .status(500)
              .json({ success: false, message: "Insert failed" });
          }

          return res.status(201).json({
            success: true,
            message: "Property added successfully",
            id: result.insertId,
          });
        });
      }
    );
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ success: false, message: "Server error" });
  }
};



/* ---------- UPDATE PROPERTY ---------- */
export const updateProperty = async (req, res) => {
  try {
    const { propertyid } = req.params;

    if (!propertyid) {
      return res.status(400).json({ message: "Property ID is required" });
    }

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

    /*  CHECK DUPLICATE NAME */
    db.query(
      `SELECT propertyid FROM properties 
       WHERE propertyName = ? AND propertyid != ?`,
      [property_name, propertyid],
      async (err, exists) => {
        if (err)
          return res
            .status(500)
            .json({ message: "Database error", error: err });

        if (exists.length > 0) {
          return res
            .status(409)
            .json({ message: "Property name already exists!" });
        }

        /*  PARSE AREAS */
        let parsedAreas = [];
        if (typeof areas === "string") parsedAreas = JSON.parse(areas);
        else if (Array.isArray(areas)) parsedAreas = areas;

        const builtUpArea =
          parsedAreas.find((a) =>
            a.label?.toLowerCase().includes("built-up")
          )?.value || null;

        const carpetArea =
          parsedAreas.find((a) =>
            a.label?.toLowerCase().includes("carpet")
          )?.value || null;

        /*  IMAGE UPLOAD (ONLY IF SENT) */
        const uploadField = async (field) => {
          if (!req.files || !req.files[field]) return null;

          const urls = [];
          for (const file of req.files[field]) {
            const url = await uploadToS3(file);
            urls.push(url);
          }
          return JSON.stringify(urls);
        };

        const images = {
          frontView: await uploadField("frontView"),
          sideView: await uploadField("sideView"),
          kitchenView: await uploadField("kitchenView"),
          hallView: await uploadField("hallView"),
          bedroomView: await uploadField("bedroomView"),
          bathroomView: await uploadField("bathroomView"),
          balconyView: await uploadField("balconyView"),
          nearestLandmark: await uploadField("nearestLandmark"),
          developedAmenities: await uploadField("developedAmenities"),
        };

        /*  BASE UPDATE QUERY */
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
          toSlug(property_name),
        ];

        /*  ADD IMAGE FIELDS CONDITIONALLY */
        Object.entries(images).forEach(([key, value]) => {
          if (value !== null) {
            updateSQL += `, ${key} = ?`;
            values.push(value);
          }
        });

        updateSQL += ` WHERE propertyid = ?`;
        values.push(propertyid);

        /*  EXECUTE UPDATE */
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
            success: true,
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

