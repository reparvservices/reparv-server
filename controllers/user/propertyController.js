import db from "../../config/dbconnect.js";
import moment from "moment-timezone";
import { sanitize } from "../../utils/sanitize.js";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "../../utils/s3Client.js";
import { deleteFromS3 } from "../../utils/imageUpload.js";

function toSlug(text) {
  return text
    .toLowerCase() // Convert to lowercase
    .trim() // Remove leading/trailing spaces
    .replace(/[^a-z0-9\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-"); // Replace multiple hyphens with single
}

const calculateEMI = (principal, rate = 9, years = 20) => {
  const monthlyRate = rate / 12 / 100;
  const months = years * 12;

  if (monthlyRate === 0) return principal / months;

  const emi =
    (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) /
    (Math.pow(1 + monthlyRate, months) - 1);

  return Math.round(emi);
};

// **Fetch All Properties with Likes Count**
export const getAll = (req, res) => {
  const sql = `
    SELECT 
      properties.*,
      property_analytics.views AS views,
      property_analytics.share AS share,
      builders.company_name,
      COUNT(DISTINCT user_property_wishlist.user_id) AS likes 
    FROM properties

    LEFT JOIN property_analytics
      ON properties.propertyid = property_analytics.property_id

    LEFT JOIN builders
      ON properties.builderid = builders.builderid

    LEFT JOIN user_property_wishlist
      ON properties.propertyid = user_property_wishlist.property_id

    WHERE properties.guestUserId = ?

    GROUP BY properties.propertyid

    ORDER BY properties.propertyid DESC
  `;

  db.query(sql, [req.guestUser?.id], (err, result) => {
    if (err) {
      console.error("Error fetching properties:", err);
      return res.status(500).json({
        message: "Database error",
        error: err,
      });
    }

    res.json(result);
  });
};

// **Fetch Single Property by ID (with Likes Count)**
export const getById = (req, res) => {
  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Property ID" });
  }

  const sql = `
    SELECT 
      properties.*,
      builders.company_name,
      COUNT(DISTINCT user_property_wishlist.user_id) AS likes 
    FROM properties

    LEFT JOIN builders
      ON builders.builderid = properties.builderid

    LEFT JOIN user_property_wishlist
      ON user_property_wishlist.property_id = properties.propertyid

    WHERE properties.propertyid = ?

    GROUP BY properties.propertyid
  `;

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching property:", err);
      return res.status(500).json({
        message: "Database error",
        error: err,
      });
    }

    if (!result.length) {
      return res.status(404).json({ message: "Property not found" });
    }

    // Safely parse JSON fields
    const row = result[0];
    let parsedType = [];

    try {
      parsedType = row.propertyType ? JSON.parse(row.propertyType) : [];
    } catch (e) {
      console.warn("Invalid JSON in propertyType:", row.propertyType);
    }

    res.json({
      ...row,
      propertyType: parsedType,
    });
  });
};

// get all images
export const getImages = (req, res) => {
  const partnerId = req.user.id;
  if (!partnerId) {
    return res.status(400).json({ message: "Unauthorized Access" });
  }

  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Property ID" });
  }

  const sql = "SELECT * FROM propertiesimages WHERE propertyid = ?";
  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching property images:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Property not found" });
    }
    res.json(result);
  });
};

export const addProperty = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const partnerId = req.guestUser?.id;

  if (!partnerId) {
    return res.status(401).json({ message: "Unauthorized Access" });
  }

  const {
    propertyCategory,
    propertyName,
    totalSalesPrice,
    totalOfferPrice,
    builtUpArea,
    carpetArea,
    address,
    state,
    city,
    projectBy,
    contact,
    email,

    // IMAGE URL ARRAYS FROM FRONTEND (S3)
    frontView = [],
    sideView = [],
    kitchenView = [],
    hallView = [],
    bedroomView = [],
    bathroomView = [],
    balconyView = [],
    nearestLandmark = [],
    developedAmenities = [],
  } = req.body;

  if (!propertyName || !propertyCategory || !city || !state) {
    return res.status(400).json({
      message: "Property name, category, city, and state are required",
    });
  }

  try {
    // 1 Check duplicate property name
    const [existing] = await db
      .promise()
      .query("SELECT propertyid FROM properties WHERE propertyName = ?", [
        propertyName,
      ]);

    if (existing.length > 0) {
      return res.status(409).json({ message: "Property name already exists!" });
    }

    // 2 Insert property (store URL arrays as JSON strings)
    const insertSQL = `
      INSERT INTO properties (
        guestUserId, propertyCategory, propertyName,
        totalSalesPrice, totalOfferPrice, builtUpArea, carpetArea, address,
        state, city, projectBy, contact, email, seoSlug,
        frontView, sideView, kitchenView, hallView,
        bedroomView, bathroomView, balconyView,
        nearestLandmark, developedAmenities,
        updated_at, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      partnerId,
      propertyCategory,
      propertyName,
      totalSalesPrice || null,
      totalOfferPrice || null,
      builtUpArea || null,
      carpetArea || null,
      address || null,
      state,
      city,
      projectBy || null,
      contact || null,
      email || null,
      toSlug(propertyName),
      JSON.stringify(frontView),
      JSON.stringify(sideView),
      JSON.stringify(kitchenView),
      JSON.stringify(hallView),
      JSON.stringify(bedroomView),
      JSON.stringify(bathroomView),
      JSON.stringify(balconyView),
      JSON.stringify(nearestLandmark),
      JSON.stringify(developedAmenities),

      currentdate,
      currentdate,
    ];

    const [insertResult] = await db.promise().query(insertSQL, values);
    const newPropertyId = insertResult.insertId;

    // 3 Get cityNACL
    const [cityResult] = await db
      .promise()
      .query("SELECT cityNACL FROM cities WHERE city = ? LIMIT 1", [city]);

    if (!cityResult.length) {
      return res.status(404).json({ message: "City not found in database" });
    }

    const cityNACL = cityResult[0].cityNACL;
    const propertyCityId = `${cityNACL}-${newPropertyId}`;

    // 4 Update propertyCityId
    await db
      .promise()
      .query("UPDATE properties SET propertyCityId = ? WHERE propertyid = ?", [
        propertyCityId,
        newPropertyId,
      ]);

    return res.status(201).json({
      message: "Property added successfully",
      id: newPropertyId,
      propertyCityId,
    });
  } catch (error) {
    console.error("addProperty error:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message || error,
    });
  }
};

export const update = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const partnerId = req.guestUser?.id;

  if (!partnerId) {
    return res.status(401).json({ message: "Unauthorized Access" });
  }

  const Id = Number(req.params.id);
  if (!Id) {
    return res.status(400).json({ message: "Invalid property ID" });
  }

  const {
    propertyCategory,
    propertyName,
    totalSalesPrice,
    totalOfferPrice,
    builtUpArea,
    carpetArea,
    address,
    state,
    city,
    projectBy,
    contact,
    email,

    // IMAGE URL ARRAYS (S3)
    frontView,
    sideView,
    kitchenView,
    hallView,
    bedroomView,
    bathroomView,
    balconyView,
    nearestLandmark,
    developedAmenities,
  } = req.body;

  // Minimal required fields (same as addProperty)
  if (!propertyName || !propertyCategory || !city || !state) {
    return res.status(400).json({
      message: "Property name, category, city, and state are required",
    });
  }

  try {
    // 1 Fetch existing property
    const [rows] = await db
      .promise()
      .query("SELECT * FROM properties WHERE propertyid = ?", [Id]);

    if (!rows.length) {
      return res.status(404).json({ message: "Property not found" });
    }

    const existing = rows[0];

    // IMAGE MERGE (keep old if not sent)
    const keepOrReplace = (incoming, existingValue) =>
      Array.isArray(incoming) ? JSON.stringify(incoming) : existingValue;

    // 2 Update property
    const updateSQL = `
      UPDATE properties SET
        propertyCategory=?,
        propertyName=?,
        totalSalesPrice=?,
        totalOfferPrice=?,
        builtUpArea=?,
        carpetArea=?,
        address=?,
        state=?,
        city=?,
        projectBy=?,
        contact=?,
        email=?,

        frontView=?,
        sideView=?,
        kitchenView=?,
        hallView=?,
        bedroomView=?,
        bathroomView=?,
        balconyView=?,
        nearestLandmark=?,
        developedAmenities=?,

        updated_at=?
      WHERE propertyid=?
    `;

    const values = [
      propertyCategory,
      propertyName,
      totalSalesPrice || null,
      totalOfferPrice || null,
      builtUpArea || null,
      carpetArea || null,
      address || null,
      state,
      city,
      projectBy || null,
      contact || null,
      email || null,

      keepOrReplace(frontView, existing.frontView),
      keepOrReplace(sideView, existing.sideView),
      keepOrReplace(kitchenView, existing.kitchenView),
      keepOrReplace(hallView, existing.hallView),
      keepOrReplace(bedroomView, existing.bedroomView),
      keepOrReplace(bathroomView, existing.bathroomView),
      keepOrReplace(balconyView, existing.balconyView),
      keepOrReplace(nearestLandmark, existing.nearestLandmark),
      keepOrReplace(developedAmenities, existing.developedAmenities),

      currentdate,
      Id,
    ];

    await db.promise().query(updateSQL, values);

    return res.status(200).json({
      message: "Property updated successfully",
      id: Id,
    });
  } catch (error) {
    console.error("updateProperty error:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message || error,
    });
  }
};

export const addImages = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const propertyId = req.body.propertyid ? Number(req.body.propertyid) : null;

  const { images } = req.body; // array of S3 URLs

  if (!propertyId) {
    return res.status(400).json({ message: "Property ID is required" });
  }

  if (!Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ message: "Images array is required" });
  }

  try {
    const insertSQL = `
      INSERT INTO propertiesimages
      (propertyid, image, updated_at, created_at)
      VALUES ?
    `;

    const values = images.map((url) => [
      propertyId,
      url,
      currentdate,
      currentdate,
    ]);

    db.query(insertSQL, [values], (err) => {
      if (err) {
        console.error("Error inserting images:", err);
        return res.status(500).json({
          message: "Database error",
          error: err,
        });
      }

      res.status(200).json({
        message: "Images added successfully",
        images,
      });
    });
  } catch (error) {
    console.error("addImages error:", error);
    res.status(500).json({
      message: "Image insert failed",
      error: error.message || error,
    });
  }
};

// **Delete Property + S3 Images**
export const del = (req, res) => {
  const Id = parseInt(req.params.id);

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Property ID" });
  }

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

  // Step 1: Fetch all image URLs from DB
  db.query(
    `SELECT ${imageFields.join(", ")} FROM properties WHERE propertyid = ?`,
    [Id],
    async (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      if (result.length === 0) {
        return res.status(404).json({ message: "Property not found" });
      }

      const property = result[0];

      try {
        // Step 2: Delete images from S3
        for (const field of imageFields) {
          if (!property[field]) continue;

          const urls = JSON.parse(property[field]);

          if (Array.isArray(urls)) {
            for (const url of urls) {
              await deleteFromS3(url);
            }
          }
        }

        // Step 3: Delete property from DB
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
      } catch (s3Error) {
        console.error("S3 delete error:", s3Error);
        return res.status(500).json({
          message: "Failed to delete images from S3",
          error: s3Error,
        });
      }
    }
  );
};

// ** New Additional Info Add API **
export const additionalInfoAdd = (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");

  const {
    propertyid,
    wing,
    floor,
    flatno,
    direction,
    ageofconstruction,
    carpetarea,
    superbuiltup,
    salesprice,
    description,
    ownercontact,
  } = req.body;

  // Files check
  const owneradhar = req.files?.owneradhar
    ? req.files.owneradhar[0].filename
    : null;
  const ownerpan = req.files?.ownerpan ? req.files.ownerpan[0].filename : null;
  const schedule = req.files?.schedule ? req.files.schedule[0].filename : null;
  const signed = req.files?.signed ? req.files.signed[0].filename : null;
  const satbara = req.files?.satbara ? req.files.satbara[0].filename : null;
  const ebill = req.files?.ebill ? req.files.ebill[0].filename : null;

  const insertSQL = `
    INSERT INTO propertiesinfo 
    (propertyid, wing, floor, flatno, direction, ageofconstruction, carpetarea, superbuiltup, salesprice, description, ownercontact,
      owneradhar, ownerpan, schedule, signed, satbara, ebill, updated_at, created_at) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    insertSQL,
    [
      propertyid,
      wing,
      floor,
      flatno,
      direction,
      ageofconstruction,
      carpetarea,
      superbuiltup,
      salesprice,
      description,
      ownercontact,
      owneradhar,
      ownerpan,
      schedule,
      signed,
      satbara,
      ebill,
      currentdate,
      currentdate,
    ],
    (insertErr, insertResult) => {
      if (insertErr) {
        console.error("Error inserting:", insertErr);
        return res
          .status(500)
          .json({ message: "Database error", error: insertErr });
      }

      res.status(201).json({
        message: "Additional Info added successfully",
        Id: insertResult.insertId,
      });
    }
  );
};

// ** Additional Info Edit API **
export const editAdditionalInfo = (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const Id = parseInt(req.params.id);

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Property Info ID" });
  }

  const {
    wing,
    floor,
    flatno,
    direction,
    ageofconstruction,
    carpetarea,
    superbuiltup,
    salesprice,
    description,
    ownercontact,
  } = req.body;

  // Files check
  const owneradhar = req.files?.owneradhar
    ? req.files.owneradhar[0].filename
    : null;
  const ownerpan = req.files?.ownerpan ? req.files.ownerpan[0].filename : null;
  const schedule = req.files?.schedule ? req.files.schedule[0].filename : null;
  const signed = req.files?.signed ? req.files.signed[0].filename : null;
  const satbara = req.files?.satbara ? req.files.satbara[0].filename : null;
  const ebill = req.files?.ebill ? req.files.ebill[0].filename : null;

  // Start fields and values
  let updateFields = [
    "wing = ?",
    "floor = ?",
    "flatno = ?",
    "direction = ?",
    "ageofconstruction = ?",
    "carpetarea = ?",
    "superbuiltup = ?",
    "salesprice = ?",
    "description = ?",
    "ownercontact = ?",
    "updated_at = ?",
  ];

  const updateValues = [
    wing,
    floor,
    flatno,
    direction,
    ageofconstruction,
    carpetarea,
    superbuiltup,
    salesprice,
    description,
    ownercontact,
    currentdate,
  ];

  // Dynamically add files if uploaded
  if (owneradhar) {
    updateFields.push("owneradhar = ?");
    updateValues.push(owneradhar);
  }
  if (ownerpan) {
    updateFields.push("ownerpan = ?");
    updateValues.push(ownerpan);
  }
  if (schedule) {
    updateFields.push("schedule = ?");
    updateValues.push(schedule);
  }
  if (signed) {
    updateFields.push("signed = ?");
    updateValues.push(signed);
  }
  if (satbara) {
    updateFields.push("satbara = ?");
    updateValues.push(satbara);
  }
  if (ebill) {
    updateFields.push("ebill = ?");
    updateValues.push(ebill);
  }

  const updateSQL = `UPDATE propertiesinfo SET ${updateFields.join(
    ", "
  )} WHERE propertyinfoid = ?`;

  updateValues.push(Id);

  db.query(updateSQL, updateValues, (err, result) => {
    if (err) {
      console.error("Error updating:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    res.status(200).json({
      message: "Additional Info updated successfully",
      affectedRows: result.affectedRows,
    });
  });
};

export const deleteImages = (req, res) => {
  const imageId = Number(req.params.id);

  if (!imageId) {
    return res.status(400).json({ message: "Invalid Image ID" });
  }

  // 1️⃣ Fetch image URL from DB
  db.query(
    "SELECT image FROM propertiesimages WHERE imageid = ?",
    [imageId],
    async (err, result) => {
      if (err) {
        console.error("Error fetching image:", err);
        return res.status(500).json({
          message: "Database error",
          error: err,
        });
      }

      if (result.length === 0) {
        return res.status(404).json({ message: "Image not found" });
      }

      const imageUrl = result[0].image;

      try {
        // 2️⃣ Extract S3 key from URL
        // Example URL:
        // https://bucket.s3.amazonaws.com/property/gallery/img.webp
        const bucketName = process.env.AWS_S3_BUCKET;
        const key = decodeURIComponent(imageUrl.split(".amazonaws.com/")[1]);

        // 3️⃣ Delete from S3
        await s3.send(
          new DeleteObjectCommand({
            Bucket: bucketName,
            Key: key,
          })
        );

        // 4️⃣ Delete DB record
        db.query(
          "DELETE FROM propertiesimages WHERE imageid = ?",
          [imageId],
          (err) => {
            if (err) {
              console.error("Error deleting DB record:", err);
              return res.status(500).json({
                message: "Database error",
                error: err,
              });
            }

            res.status(200).json({
              message: "Image deleted successfully",
            });
          }
        );
      } catch (error) {
        console.error("S3 delete error:", error);
        res.status(500).json({
          message: "Failed to delete image from S3",
          error: error.message || error,
        });
      }
    }
  );
};

export const propertyInfo = (req, res) => {
  const Id = parseInt(req.params.id);
  if (isNaN(Id))
    return res.status(400).json({ message: "Invalid Property ID" });

  const sql = "SELECT * FROM propertiesinfo WHERE propertyid = ?";
  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching property:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    if (result.length === 0) {
      return res.status(201).json({ propertyid: Id });
    }
    res.json(result[0]);
  });
};
