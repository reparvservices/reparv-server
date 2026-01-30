import db from "../../config/dbconnect.js";
import moment from "moment";
import { sanitize } from "../../utils/sanitize.js";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "../../utils/s3Client.js";

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
        state, city, projectBy, contact, email,
        frontView, sideView, kitchenView, hallView,
        bedroomView, bathroomView, balconyView,
        nearestLandmark, developedAmenities,
        updated_at, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    builderid,
    projectBy,
    possessionDate,
    propertyCategory,
    propertyApprovedBy,
    propertyName,
    address,
    state,
    city,
    pincode,
    location,
    distanceFromCityCenter,
    latitude,
    longitude,
    totalSalesPrice,
    totalOfferPrice,
    stampDuty,
    gst,
    advocateFee,
    msebWater,
    maintenance,
    other,
    tags,
    propertyType,
    builtYear,
    ownershipType,
    builtUpArea,
    carpetArea,
    parkingAvailability,
    totalFloors,
    floorNo,
    loanAvailability,
    propertyFacing,
    reraRegistered,
    furnishing,
    waterSupply,
    powerBackup,
    locationFeature,
    sizeAreaFeature,
    parkingFeature,
    terraceFeature,
    ageOfPropertyFeature,
    amenitiesFeature,
    propertyStatusFeature,
    smartHomeFeature,
    securityBenefit,
    primeLocationBenefit,
    rentalIncomeBenefit,
    qualityBenefit,
    capitalAppreciationBenefit,
    ecofriendlyBenefit,

    // ✅ IMAGE URL ARRAYS (S3)
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

  /* ---------------- VALIDATION (UNCHANGED LOGIC) ---------------- */
  if (
    !builderid ||
    !propertyCategory ||
    !propertyName ||
    !address ||
    !state ||
    !city ||
    !pincode ||
    !location ||
    !distanceFromCityCenter ||
    !latitude ||
    !longitude ||
    !totalSalesPrice ||
    !totalOfferPrice ||
    !stampDuty ||
    !other ||
    !tags ||
    !builtYear ||
    !ownershipType ||
    !carpetArea ||
    !parkingAvailability ||
    !loanAvailability ||
    !propertyFacing ||
    !waterSupply ||
    !powerBackup ||
    !locationFeature ||
    !sizeAreaFeature ||
    !parkingFeature ||
    !ageOfPropertyFeature ||
    !amenitiesFeature ||
    !propertyStatusFeature ||
    !securityBenefit ||
    !primeLocationBenefit ||
    !rentalIncomeBenefit ||
    !capitalAppreciationBenefit ||
    !ecofriendlyBenefit
  ) {
    return res.status(400).json({ message: "All fields are required" });
  }

  /* ---------------- REGISTRATION FEE ---------------- */
  let registrationFees;
  if (totalOfferPrice > 3000000) {
    registrationFees = (30000 / totalOfferPrice) * 100;
  } else {
    registrationFees = ["RentalFlat", "RentalShop", "RentalOffice"].includes(
      propertyCategory
    )
      ? 0
      : 1;
  }

  const emi = calculateEMI(Number(totalOfferPrice));

  /* ---------------- DATE FORMAT ---------------- */
  const formattedPossessionDate =
    possessionDate &&
    moment(possessionDate, ["YYYY-MM-DD", moment.ISO_8601], true).isValid()
      ? moment(possessionDate).format("YYYY-MM-DD")
      : null;

  /* ---------------- PROPERTY TYPE ---------------- */
  const propertyTypeJson = JSON.stringify(
    Array.isArray(propertyType)
      ? propertyType
      : typeof propertyType === "string"
      ? propertyType.split(",").map((i) => i.trim())
      : []
  );

  /* ---------------- FETCH EXISTING ---------------- */
  db.query(
    "SELECT * FROM properties WHERE propertyid = ?",
    [Id],
    (err, result) => {
      if (err) {
        return res.status(500).json({ message: "Database error", err });
      }

      if (!result.length) {
        return res.status(404).json({ message: "Property not found" });
      }

      const existing = result[0];

      const approve =
        existing.approve === "Rejected" || existing.approve === "Not Approved"
          ? "Not Approved"
          : "Approved";

      /* 🔥 IMAGE MERGE LOGIC (VERY IMPORTANT) */
      const keepOrReplace = (incoming, existing) =>
        Array.isArray(incoming) ? JSON.stringify(incoming) : existing;

      const updateSQL = `
        UPDATE properties SET
          rejectreason=NULL, approve=?,
          builderid=?, projectBy=?, possessionDate=?, propertyCategory=?, propertyApprovedBy=?,
          propertyName=?, address=?, state=?, city=?, pincode=?, location=?,
          distanceFromCityCenter=?, latitude=?, longitude=?, totalSalesPrice=?, totalOfferPrice=?, emi=?,
          stampDuty=?, registrationFee=?, gst=?, advocateFee=?, msebWater=?, maintenance=?,
          other=?, tags=?, propertyType=?, builtYear=?, ownershipType=?,
          builtUpArea=?, carpetArea=?, parkingAvailability=?, totalFloors=?, floorNo=?, loanAvailability=?,
          propertyFacing=?, reraRegistered=?, furnishing=?, waterSupply=?, powerBackup=?,
          locationFeature=?, sizeAreaFeature=?, parkingFeature=?, terraceFeature=?,
          ageOfPropertyFeature=?, amenitiesFeature=?, propertyStatusFeature=?, smartHomeFeature=?,
          securityBenefit=?, primeLocationBenefit=?, rentalIncomeBenefit=?, qualityBenefit=?,
          capitalAppreciationBenefit=?, ecofriendlyBenefit=?,
          frontView=?, sideView=?, kitchenView=?, hallView=?, bedroomView=?, bathroomView=?, balconyView=?,
          nearestLandmark=?, developedAmenities=?, updated_at=?
        WHERE propertyid = ?
      `;

      const values = [
        approve,
        builderid,
        sanitize(projectBy),
        sanitize(formattedPossessionDate),
        propertyCategory,
        propertyApprovedBy,
        propertyName,
        address,
        state,
        city,
        pincode,
        location,
        distanceFromCityCenter,
        latitude,
        longitude,
        totalSalesPrice,
        totalOfferPrice,
        emi,
        stampDuty,
        registrationFees,
        gst,
        advocateFee,
        msebWater,
        maintenance,
        other,
        tags,
        propertyTypeJson,
        builtYear,
        ownershipType,
        builtUpArea,
        carpetArea,
        parkingAvailability,
        totalFloors,
        floorNo,
        loanAvailability,
        propertyFacing,
        reraRegistered,
        furnishing,
        waterSupply,
        powerBackup,
        locationFeature,
        sizeAreaFeature,
        parkingFeature,
        terraceFeature,
        ageOfPropertyFeature,
        amenitiesFeature,
        propertyStatusFeature,
        smartHomeFeature,
        securityBenefit,
        primeLocationBenefit,
        rentalIncomeBenefit,
        qualityBenefit,
        capitalAppreciationBenefit,
        ecofriendlyBenefit,
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

      db.query(updateSQL, values, (err) => {
        if (err) {
          console.error("Update error:", err);
          return res.status(500).json({ message: "Update failed", err });
        }

        res.status(200).json({ message: "Property updated successfully" });
      });
    }
  );
};

export const addImages = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const propertyId = req.body.propertyid ? Number(req.body.propertyid) : null;

  const { images } = req.body; // ✅ array of S3 URLs

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
