import db from "../../config/dbconnect.js";
import moment from "moment";
import fs from "fs";
import path from "path";
import csv from "csv-parser";
import { convertImagesToWebp } from "../../utils/convertImagesToWebp.js";
import { sanitize } from "../../utils/sanitize.js";

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

// **Fetch All Properties**
export const getAll = (req, res) => {
  const propertyLister = req.params.lister;
  if (!propertyLister) {
    return res.status(401).json({ message: "Select Listerr Not Selected" });
  }
  let sql;

  if (propertyLister === "Reparv Employee") {
    sql = `SELECT properties.*,
                      builders.company_name, 
                      employees.name AS fullname, 
                      employees.contact
               FROM properties 
               INNER JOIN builders ON properties.builderid = builders.builderid 
               INNER JOIN employees ON properties.employeeid = employees.id 
               ORDER BY properties.created_at DESC;`;
  } else if (propertyLister === "Project Partner") {
    sql = `SELECT properties.*,
           builders.company_name, 
           projectpartner.fullname, 
           projectpartner.contact,
           projectpartner.city AS partnerCity
        FROM properties 
        INNER JOIN builders ON properties.builderid = builders.builderid 
        INNER JOIN projectpartner ON properties.projectpartnerid = projectpartner.id 
        ORDER BY properties.created_at DESC;`;
  } else if (propertyLister === "Guest User") {
    sql = `SELECT properties.*,
           builders.company_name, 
           guestUsers.fullname, 
           guestUsers.contact,
           guestUsers.city AS partnerCity
        FROM properties 
        INNER JOIN builders ON properties.builderid = builders.builderid 
        INNER JOIN guestUsers ON properties.guestUserId = guestUsers.id 
        ORDER BY properties.created_at DESC;`;
  } else {
    sql = `SELECT properties.*,
                      builders.company_name 
               FROM properties 
               LEFT JOIN builders ON properties.builderid = builders.builderid 
               ORDER BY properties.created_at DESC;`;
  }

  db.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching properties:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    const formatted = result.map((row) => ({
      ...row,
      created_at: moment(row.created_at).format("DD MMM YYYY | hh:mm A"),
      updated_at: moment(row.updated_at).format("DD MMM YYYY | hh:mm A"),
    }));

    res.json(formatted);
  });
};

// **Fetch Single Property by ID**
export const getById = (req, res) => {
  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Property ID" });
  }

  const sql = `
    SELECT 
      properties.*,
      builders.company_name, 
      onboardingpartner.fullname, 
      onboardingpartner.contact, 
      onboardingpartner.email,
      onboardingpartner.city AS partnerCity
    FROM properties
    LEFT JOIN builders ON builders.builderid = properties.builderid
    LEFT JOIN onboardingpartner ON properties.partnerid = onboardingpartner.partnerid
    WHERE properties.propertyid = ?
    ORDER BY properties.propertyid DESC;
  `;

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching property:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (result.length === 0) {
      return res.status(404).json({ message: "Property not found" });
    }

    // safely parse JSON fields
    const formatted = result.map((row) => {
      let parsedType = null;
      try {
        parsedType = row.propertyType ? JSON.parse(row.propertyType) : [];
      } catch (e) {
        console.warn("Invalid JSON in propertyType:", row.propertyType);
        parsedType = [];
      }

      return {
        ...row,
        propertyType: parsedType,
      };
    });

    res.json(formatted[0]);
  });
};

export const checkPropertyName = (req, res) => {
  try {
    let { propertyName } = req.body;

    if (!propertyName || propertyName.trim() === "") {
      return res.status(400).json({
        success: false,
        unique: null,
        message: "Property Name",
      });
    }

    propertyName = propertyName.trim();
    // Case-insensitive check
    const sql =
      "SELECT propertyid FROM properties WHERE LOWER(propertyName) = LOWER(?) LIMIT 1";

    db.query(sql, [propertyName], (err, rows) => {
      if (err) {
        console.error("Error checking property name:", err);
        return res.status(500).json({
          success: false,
          unique: null,
          message: "Server error while checking property name",
        });
      }

      if (rows.length > 0) {
        return res.status(200).json({
          success: true,
          unique: false,
          message: "Property Name already exists",
        });
      }

      return res.status(200).json({
        success: true,
        unique: true,
        message: "Property Name is available",
      });
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return res.status(500).json({
      success: false,
      unique: null,
      message: "Unexpected server error",
    });
  }
};

export const addProperty = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");

  // Convert uploaded images to WebP
  const files = await convertImagesToWebp(req.files);

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
    registrationFee,
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
  } = req.body;

  // Required validation
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

  // Property Registration Fee logic
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

  const seoSlug = toSlug(propertyName);

  const calculateEMI = (price) => {
    const interestRate = 0.08 / 12;
    const tenureMonths = 240;

    return Math.round(
      (price * interestRate * Math.pow(1 + interestRate, tenureMonths)) /
        (Math.pow(1 + interestRate, tenureMonths) - 1)
    );
  };

  const emi = calculateEMI(Number(totalOfferPrice));

  // Fix date
  let formattedPossessionDate = null;
  if (possessionDate && possessionDate.trim() !== "") {
    if (
      moment(possessionDate, ["YYYY-MM-DD", moment.ISO_8601], true).isValid()
    ) {
      formattedPossessionDate = moment(possessionDate).format("YYYY-MM-DD");
    }
  }

  // Convert propertyType to array
  let propertyTypeArray = [];
  if (Array.isArray(propertyType)) propertyTypeArray = propertyType;
  else if (typeof propertyType === "string")
    propertyTypeArray = propertyType.split(",").map((i) => i.trim());
  const propertyTypeJson = JSON.stringify(propertyTypeArray);

  const getImagePaths = (field) =>
    files[field]
      ? JSON.stringify(files[field].map((f) => `/uploads/${f.filename}`))
      : null;

  const frontView = getImagePaths("frontView");
  const sideView = getImagePaths("sideView");
  const kitchenView = getImagePaths("kitchenView");
  const hallView = getImagePaths("hallView");
  const bedroomView = getImagePaths("bedroomView");
  const bathroomView = getImagePaths("bathroomView");
  const balconyView = getImagePaths("balconyView");
  const nearestLandmark = getImagePaths("nearestLandmark");
  const developedAmenities = getImagePaths("developedAmenities");

  // Check property exists
  db.query(
    "SELECT propertyid FROM properties WHERE propertyName = ?",
    [propertyName],
    (err, result) => {
      if (err)
        return res.status(500).json({ message: "Database error", error: err });

      if (result.length > 0)
        return res
          .status(409)
          .json({ message: "Property name already exists!" });

      const insertSQL = `
        INSERT INTO properties (
          builderid, projectBy, possessionDate, propertyCategory, propertyApprovedBy, propertyName, address, state, city, pincode, location,
          distanceFromCityCenter, latitude, longitude, totalSalesPrice, totalOfferPrice, emi, stampDuty, registrationFee, gst, advocateFee, 
          msebWater, maintenance, other, tags, propertyType, builtYear, ownershipType, builtUpArea, carpetArea,
          parkingAvailability, totalFloors, floorNo, loanAvailability, propertyFacing, reraRegistered, 
          furnishing, waterSupply, powerBackup, locationFeature, sizeAreaFeature, parkingFeature, terraceFeature,
          ageOfPropertyFeature, amenitiesFeature, propertyStatusFeature, smartHomeFeature,
          securityBenefit, primeLocationBenefit, rentalIncomeBenefit, qualityBenefit, capitalAppreciationBenefit, ecofriendlyBenefit,
          frontView, sideView, kitchenView, hallView, bedroomView, bathroomView, balconyView,
          nearestLandmark, developedAmenities, seoSlug,
          updated_at, created_at
        ) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const values = [
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
        currentdate,
        currentdate,
      ];

      // SINGLE INSERT (correct)
      db.query(insertSQL, values, (err, result) => {
        if (err) {
          return res.status(500).json({ message: "Insert failed", error: err });
        }

        const newPropertyId = result.insertId;

        // STEP 1 – Fetch cityNACL
        db.query(
          "SELECT cityNACL FROM cities WHERE city = ? LIMIT 1",
          [city],
          (err2, cityResult) => {
            if (err2)
              return res
                .status(500)
                .json({ message: "City lookup failed", error: err2 });

            if (cityResult.length === 0)
              return res
                .status(404)
                .json({ message: "City not found in database" });

            const cityNACL = cityResult[0].cityNACL;
            const propertyCityId = `${cityNACL}-${newPropertyId}`;

            // STEP 2 – Update property with propertyCityId
            db.query(
              "UPDATE properties SET propertyCityId = ? WHERE propertyid = ?",
              [propertyCityId, newPropertyId],
              (err3) => {
                if (err3)
                  return res.status(500).json({
                    message: "Failed to update propertyCityId",
                    error: err3,
                  });

                return res.status(201).json({
                  message: "Property added successfully",
                  id: newPropertyId,
                  propertyCityId,
                });
              }
            );
          }
        );
      });
    }
  );
};

// Update property controller
export const update = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const Id = req.params.id;

  if (!Id) {
    return res.status(400).json({ message: "Invalid property ID" });
  }

  const files = await convertImagesToWebp(req.files);

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
    registrationFee,
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
  } = req.body;

  // Validation
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
    return res.status(400).json({ message: "All Fields are required" });
  }

  // Property Registration Fee is 1% or Maximum 30,000 Rs
  let registrationFees;
  if (totalOfferPrice > 3000000) {
    registrationFees = (30000 / totalOfferPrice) * 100;
  } else {
    if (
      ["RentalFlat", "RentalShop", "RentalOffice"].includes(propertyCategory)
    ) {
      registrationFees = 0;
    } else {
      registrationFees = 1;
    }
  }

  const emi = calculateEMI(Number(totalOfferPrice));

  // Format dates to remove time portion
  let formattedPossessionDate = null;

  if (possessionDate && possessionDate.trim() !== "") {
    // Check if it's a valid date
    if (
      moment(possessionDate, ["YYYY-MM-DD", moment.ISO_8601], true).isValid()
    ) {
      formattedPossessionDate = moment(possessionDate).format("YYYY-MM-DD");
    } else {
      formattedPossessionDate = null; // fallback instead of "Invalid date"
    }
  }

  // Convert Property Type Into Array
  let propertyTypeArray;

  if (Array.isArray(propertyType)) {
    // already an array
    propertyTypeArray = propertyType;
  } else if (typeof propertyType === "string") {
    // convert comma-separated string into array
    propertyTypeArray = propertyType
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item !== ""); // remove empty values
  } else {
    propertyTypeArray = [];
  }

  const propertyTypeJson = JSON.stringify(propertyTypeArray);

  // Fetch existing property to retain old image paths if not replaced
  db.query(
    "SELECT * FROM properties WHERE propertyid = ?",
    [Id],
    (err, result) => {
      if (err)
        return res.status(500).json({ message: "Database error", error: err });
      if (result.length === 0)
        return res.status(404).json({ message: "Property not found" });

      const existing = result[0];

      const getImagePaths = (field) =>
        files[field]
          ? JSON.stringify(files[field].map((f) => `/uploads/${f.filename}`))
          : existing[field];

      const updateSQL = `
      UPDATE properties SET 
        builderid=?, projectBy=?, possessionDate=?, propertyCategory=?, propertyApprovedBy=?, propertyName=?, address=?, state=?, city=?, pincode=?, location=?,
        distanceFromCityCenter=?, latitude=?, longitude=?, totalSalesPrice=?, totalOfferPrice=?, emi=?, stampDuty=?, registrationFee=?, gst=?, advocateFee=?, 
        msebWater=?, maintenance=?, other=?, tags=?, propertyType=?, builtYear=?, ownershipType=?,
        builtUpArea=?, carpetArea=?, parkingAvailability=?, totalFloors=?, floorNo=?, loanAvailability=?,
        propertyFacing=?, reraRegistered=?, furnishing=?, waterSupply=?, powerBackup=?, locationFeature=?, sizeAreaFeature=?, parkingFeature=?, terraceFeature=?,
        ageOfPropertyFeature=?, amenitiesFeature=?, propertyStatusFeature=?, smartHomeFeature=?,
        securityBenefit=?, primeLocationBenefit=?, rentalIncomeBenefit=?, qualityBenefit=?, capitalAppreciationBenefit=?, ecofriendlyBenefit=?,
        frontView=?, sideView=?, kitchenView=?, hallView=?, bedroomView=?, bathroomView=?, balconyView=?,
        nearestLandmark=?, developedAmenities=?, updated_at=?
      WHERE propertyid = ?
    `;

      const values = [
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
        getImagePaths("frontView"),
        getImagePaths("sideView"),
        getImagePaths("kitchenView"),
        getImagePaths("hallView"),
        getImagePaths("bedroomView"),
        getImagePaths("bathroomView"),
        getImagePaths("balconyView"),
        getImagePaths("nearestLandmark"),
        getImagePaths("developedAmenities"),
        currentdate,
        Id,
      ];

      db.query(updateSQL, values, (err) => {
        if (err) {
          console.error("Error updating property:", err);
          return res.status(500).json({ message: "Update failed", error: err });
        }

        res.status(200).json({ message: "Property updated successfully" });
      });
    }
  );
};

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

//**approve property */
export const approve = (req, res) => {
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

      let approve = "";
      if (result[0].approve === "Not Approved" || "Rejected") {
        approve = "Approved";
      } else {
        approve = "Not Approved";
      }

      db.query(
        "UPDATE properties SET rejectreason = NULL, approve = ? WHERE propertyid = ?",
        [approve, Id],
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

//**Change property into hot deal */
export const hotDeal = (req, res) => {
  const Id = parseInt(req.params.id);
  //console.log(Id);
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

      let hotDeal = "";
      if (result[0].hotDeal === "Active") {
        hotDeal = "Inactive";
      } else {
        hotDeal = "Active";
      }
      //console.log(status);
      db.query(
        "UPDATE properties SET hotDeal = ? WHERE propertyid = ?",
        [hotDeal, Id],
        (err, result) => {
          if (err) {
            console.error("Error deleting :", err);
            return res
              .status(500)
              .json({ message: "Database error", error: err });
          }
          res
            .status(200)
            .json({ message: "Property change into hot deal successfully" });
        }
      );
    }
  );
};

// get Property Location Latitude and Longitude
export const getPropertyLocation = (req, res) => {
  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Property ID" });
  }

  const sql = `
    SELECT latitude, longitude FROM properties
    WHERE properties.propertyid = ?
  `;

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching property location:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (result.length === 0) {
      return res.status(404).json({ message: "Property not found" });
    }

    res.json(result[0]);
  });
};

//* Change Proprty Location */
export const changePropertyLocation = (req, res) => {
  const { latitude, longitude } = req.body;
  if (!latitude || !longitude) {
    return res.status(401).json({ message: "All Field Are Required" });
  }
  const Id = parseInt(req.params.id);
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

      db.query(
        "UPDATE properties SET latitude = ?, longitude = ? WHERE propertyid = ?",
        [latitude, longitude, Id],
        (err, result) => {
          if (err) {
            console.error("Error While changing property location:", err);
            return res
              .status(500)
              .json({ message: "Database error", error: err });
          }
          res
            .status(200)
            .json({ message: "Property Location Change Successfully" });
        }
      );
    }
  );
};

// * UPLOAD Brochure, Video & Video Link *
export const uploadBrochureAndVideo = (req, res) => {
  const propertyId = req.params.id;

  if (!propertyId) {
    return res.status(400).json({ message: "Property Id is required" });
  }

  const brochureFile = req.files?.brochureFile?.[0] || null; // brochure (image/pdf)
  const videoFile = req.files?.videoFile?.[0] || null; // video
  const { videoLink } = req.body; // YouTube link

  if (!brochureFile && !videoFile && !videoLink) {
    return res
      .status(400)
      .json({ message: "No brochure, video, or video link provided" });
  }

  const brochurePath = brochureFile
    ? `/uploads/brochures/${brochureFile.filename}`
    : null;
  const videoPath = videoFile ? `/uploads/videos/${videoFile.filename}` : null;

  // Get old file paths
  db.query(
    "SELECT brochureFile, videoFile, videoLink FROM properties WHERE propertyid = ?",
    [propertyId],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      if (result.length === 0) {
        return res.status(404).json({ message: "Property not found" });
      }

      const oldBrochure = result[0].brochureFile;
      const oldVideo = result[0].videoFile;
      const oldVideoLink = result[0].videoLink;

      // Delete old files if new ones uploaded
      if (brochureFile && oldBrochure) {
        const oldPath = path.join(process.cwd(), oldBrochure);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      if (videoFile && oldVideo) {
        const oldPath = path.join(process.cwd(), oldVideo);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }

      // Update DB with new paths or link
      db.query(
        "UPDATE properties SET brochureFile = ?, videoFile = ?, videoLink = ? WHERE propertyid = ?",
        [
          brochurePath || oldBrochure,
          videoPath || oldVideo,
          videoLink || oldVideoLink,
          propertyId,
        ],
        (err) => {
          if (err) {
            console.error("Error while saving brochure/video:", err);
            return res
              .status(500)
              .json({ message: "Database error", error: err });
          }

          res.status(200).json({
            message: "Brochure, Video, or Link uploaded successfully",
            brochurePath: brochurePath || oldBrochure,
            videoPath: videoPath || oldVideo,
            videoLink: videoLink || oldVideoLink,
          });
        }
      );
    }
  );
};

// * UPLOAD Brochure & Video Link *
export const uploadBrochureAndVideoLink = async (req, res) => {
  try {
    const propertyId = req.params.id;

    if (!propertyId) {
      return res.status(400).json({ message: "Property Id is required" });
    }

    const brochureFile = req.file || null; // brochure (image/pdf)
    const { videoLink } = req.body; // YouTube or other video link

    if (!brochureFile && !videoLink) {
      return res
        .status(400)
        .json({ message: "No brochure or video link provided" });
    }

    const brochurePath = brochureFile
      ? `/uploads/brochures/${brochureFile.filename}`
      : null;

    // Get old data
    db.query(
      "SELECT brochureFile, videoLink FROM properties WHERE propertyid = ?",
      [propertyId],
      async (err, result) => {
        if (err) {
          console.error("Database error:", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }

        if (result.length === 0) {
          return res.status(404).json({ message: "Property not found" });
        }

        const oldBrochure = result[0].brochureFile;
        const oldVideoLink = result[0].videoLink;

        // Delete old brochure if new one uploaded
        if (brochureFile && oldBrochure) {
          try {
            const oldPath = path.join(process.cwd(), oldBrochure);
            await fs.unlink(oldPath);
          } catch (error) {
            console.warn("Failed to delete old brochure:", error.message);
          }
        }

        // Update DB with new brochure & video link
        db.query(
          "UPDATE properties SET brochureFile = ?, videoLink = ? WHERE propertyid = ?",
          [brochurePath || oldBrochure, videoLink || oldVideoLink, propertyId],
          (err) => {
            if (err) {
              console.error("Error while saving brochure/video link:", err);
              return res
                .status(500)
                .json({ message: "Database error", error: err });
            }

            res.status(200).json({
              message: "Brochure & Video Link updated successfully",
              brochurePath: brochurePath || oldBrochure,
              videoLink: videoLink || oldVideoLink,
            });
          }
        );
      }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// * DELETE Brochure File *
export const deleteBrochureFile = async (req, res) => {
  try {
    const propertyId = req.params.id;

    if (!propertyId) {
      return res.status(400).json({ message: "Property Id is required" });
    }

    // Get existing brochure & video link
    db.query(
      "SELECT brochureFile FROM properties WHERE propertyid = ?",
      [propertyId],
      async (err, result) => {
        if (err) {
          console.error("Database error:", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }

        if (result.length === 0) {
          return res.status(404).json({ message: "Property not found" });
        }

        const oldBrochure = result[0].brochureFile;

        // Delete brochure file if exists
        if (oldBrochure) {
          try {
            const filePath = path.join(process.cwd(), oldBrochure);
            await fs.unlink(filePath);
          } catch (error) {
            console.warn("Failed to delete brochure:", error.message);
          }
        }

        // Clear brochureFile & videoLink from DB
        db.query(
          "UPDATE properties SET brochureFile = NULL WHERE propertyid = ?",
          [propertyId],
          (err) => {
            if (err) {
              console.error("Database update error:", err);
              return res
                .status(500)
                .json({ message: "Database error", error: err });
            }

            res.status(200).json({
              message: "Brochure and Video Link deleted successfully",
            });
          }
        );
      }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

//* ADD Seo Details */
export const seoDetails = (req, res) => {
  const { seoSlug, seoTittle, seoDescription, propertyDescription } = req.body;
  if (!seoSlug || !seoTittle || !seoDescription || !propertyDescription) {
    return res.status(401).json({ message: "All Field Are Required" });
  }
  const Id = parseInt(req.params.id);
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

      db.query(
        "UPDATE properties SET seoSlug = ?, seoTittle = ?, seoDescription = ?, propertyDescription = ? WHERE propertyid = ?",
        [seoSlug, seoTittle, seoDescription, propertyDescription, Id],
        (err, result) => {
          if (err) {
            console.error("Error While Add Seo Details:", err);
            return res
              .status(500)
              .json({ message: "Database error", error: err });
          }
          res.status(200).json({ message: "Seo Details Add successfully" });
        }
      );
    }
  );
};

export const addRejectReason = (req, res) => {
  const { rejectReason } = req.body;
  if (!rejectReason) {
    return res.status(401).json({ message: "All Field Are Required" });
  }
  const Id = parseInt(req.params.id);
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

      db.query(
        "UPDATE properties SET approve = 'Rejected', rejectreason = ? WHERE propertyid = ?",
        [rejectReason, Id],
        (err, result) => {
          if (err) {
            console.error("Error While Add Reject Reason :", err);
            return res
              .status(500)
              .json({ message: "Database error", error: err });
          }
          res
            .status(200)
            .json({ message: "Property Reject Reason Add successfully" });
        }
      );
    }
  );
};

export const setPropertyCommission = (req, res) => {
  const {
    commissionType,
    commissionAmount,
    commissionPercentage,
    commissionAmountPerSquareFeet,
  } = req.body;

  const Id = parseInt(req.params.id);

  if (!commissionType || isNaN(Id)) {
    return res
      .status(400)
      .json({ message: "Commission type and valid Property ID are required" });
  }

  // Step 1: Fetch property to get required data
  db.query(
    "SELECT * FROM properties WHERE propertyid = ?",
    [Id],
    (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      if (results.length === 0) {
        return res.status(404).json({ message: "Property not found" });
      }

      const property = results[0];
      let updateSQL = "";
      let updateParams = [];

      // Step 2: Handle different commission types
      if (commissionType === "Fixed") {
        if (!commissionAmount) {
          return res
            .status(400)
            .json({ message: "commissionAmount is required for Fixed type" });
        }

        updateSQL = `UPDATE properties 
                   SET commissionType = ?, commissionAmount = ?, commissionPercentage = NULL, commissionAmountPerSquareFeet = NULL 
                   WHERE propertyid = ?`;
        updateParams = [commissionType, commissionAmount, Id];
      } else if (commissionType === "Percentage") {
        if (!commissionPercentage) {
          return res.status(400).json({
            message: "commissionPercentage is required for Percentage type",
          });
        }

        const totalPrice = parseFloat(property.totalOfferPrice || 0);
        const calculatedAmount = (totalPrice * commissionPercentage) / 100;

        updateSQL = `UPDATE properties 
                   SET commissionType = ?, commissionAmount = ?, commissionPercentage = ?, commissionAmountPerSquareFeet = NULL 
                   WHERE propertyid = ?`;
        updateParams = [
          commissionType,
          calculatedAmount,
          commissionPercentage,
          Id,
        ];
      } else if (commissionType === "PerSquareFeet") {
        if (!commissionAmountPerSquareFeet) {
          return res.status(400).json({
            message:
              "commissionAmountPerSquareFeet is required for PerSquareFeet type",
          });
        }

        const carpetArea = parseFloat(property.carpetArea || 0);
        const calculatedAmount = carpetArea * commissionAmountPerSquareFeet;

        updateSQL = `UPDATE properties 
                   SET commissionType = ?, commissionAmount = ?, commissionAmountPerSquareFeet = ?, commissionPercentage = NULL 
                   WHERE propertyid = ?`;
        updateParams = [
          commissionType,
          calculatedAmount,
          commissionAmountPerSquareFeet,
          Id,
        ];
      } else {
        return res.status(400).json({ message: "Invalid commission type" });
      }

      // Step 3: Run the update
      db.query(updateSQL, updateParams, (err, result) => {
        if (err) {
          console.error("Error While Updating Commission:", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }
        res
          .status(200)
          .json({ message: "Property commission saved successfully" });
      });
    }
  );
};

// Get all images for a specific property
export const getImages = (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized access" });
  }

  const propertyId = parseInt(req.params.id);
  if (isNaN(propertyId)) {
    return res.status(400).json({ message: "Invalid property ID" });
  }

  const sql = `
    SELECT frontView, sideView, hallView, kitchenView,
           bedroomView, balconyView, nearestLandmark,
           bathroomView, developedAmenities
    FROM properties
    WHERE propertyid = ?
  `;

  db.query(sql, [propertyId], (err, results) => {
    if (err) {
      console.error("Error fetching property images:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "Property not found" });
    }

    return res.status(200).json(results[0]);
  });
};

// ** Add Property **
export const updateImages = async (req, res) => {
  const currentdate = moment().format("YYYY-MM-DD HH:mm:ss");
  const Id = req.params.id;

  if (!Id || isNaN(Id)) {
    return res.status(400).json({ message: "Invalid property ID" });
  }

  try {
    const files = await convertImagesToWebp(req.files);

    // Fetch existing property to preserve old images if not replaced
    db.query(
      "SELECT * FROM properties WHERE propertyid = ?",
      [Id],
      (err, result) => {
        if (err) {
          console.error("DB error:", err);
          return res
            .status(500)
            .json({ message: "Database error", error: err });
        }

        if (result.length === 0) {
          return res.status(404).json({ message: "Property not found" });
        }

        const existing = result[0];

        const getImagePaths = (field) =>
          files[field]
            ? JSON.stringify(files[field].map((f) => `/uploads/${f.filename}`))
            : existing[field]; // preserve old image array

        const updateSQL = `
        UPDATE properties SET 
          frontView = ?, sideView = ?, kitchenView = ?, hallView = ?, bedroomView = ?, bathroomView = ?, 
          balconyView = ?, nearestLandmark = ?, developedAmenities = ?, updated_at = ?
        WHERE propertyid = ?
      `;

        const values = [
          getImagePaths("frontView"),
          getImagePaths("sideView"),
          getImagePaths("kitchenView"),
          getImagePaths("hallView"),
          getImagePaths("bedroomView"),
          getImagePaths("bathroomView"),
          getImagePaths("balconyView"),
          getImagePaths("nearestLandmark"),
          getImagePaths("developedAmenities"),
          currentdate,
          Id,
        ];

        db.query(updateSQL, values, (err) => {
          if (err) {
            console.error("Update error:", err);
            return res
              .status(500)
              .json({ message: "Update failed", error: err });
          }

          res
            .status(200)
            .json({ message: "Property images updated successfully" });
        });
      }
    );
  } catch (err) {
    console.error("Image conversion error:", err);
    return res
      .status(500)
      .json({ message: "File conversion failed", error: err });
  }
};

// Delete Images
export const deleteImages = (req, res) => {
  const Id = parseInt(req.params.id);
  const imageType = req.query.type; // use query param instead of req.body

  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Property ID" });
  }

  if (!imageType) {
    return res.status(400).json({ message: "Missing image type" });
  }

  // Fetch the image array string
  db.query(
    `SELECT ?? FROM properties WHERE propertyid = ?`,
    [imageType, Id],
    (err, result) => {
      if (err) {
        console.error("Error fetching images:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      if (result.length === 0) {
        return res.status(404).json({ message: "Property not found" });
      }

      const images = JSON.parse(result[0][imageType] || "[]");

      if (!images.length) {
        return res.status(404).json({ message: "No images to delete" });
      }

      // Delete image files from filesystem
      images.forEach((imgPath) => {
        const fullPath = path.join(process.cwd(), imgPath);
        fs.unlink(fullPath, (err) => {
          if (err) {
            console.warn(`Could not delete file: ${fullPath}`, err.message);
          }
        });
      });

      // Update DB to remove image references
      db.query(
        `UPDATE properties SET ?? = ? WHERE propertyid = ?`,
        [imageType, JSON.stringify([]), Id],
        (err) => {
          if (err) {
            console.error("Error updating DB:", err);
            return res
              .status(500)
              .json({ message: "DB update failed", error: err });
          }

          res.status(200).json({ message: "Images deleted successfully" });
        }
      );
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

// Get Property Info
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

// Add Additional Info Using CSV
export const addCsvFileForFlat = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "CSV file is required" });
  }

  const propertyId = parseInt(req.params?.propertyid);
  if (isNaN(propertyId)) {
    return res.status(400).json({ message: "Invalid Property ID" });
  }

  const results = [];

  const filePath = req.file.path;

  const stream = fs.createReadStream(filePath).pipe(csv());

  let responded = false; // Prevent multiple responses

  stream.on("data", (row) => {
    results.push(row);
  });

  stream.on("end", () => {
    const values = results.map((row) => [
      row.propertyid || propertyId,
      row.Mouza || null,
      row.Khasra_No || null,
      row.Wing || null,
      row.Wing_Facing || null,
      row.Floor_No || null,
      row.Flat_No || null,
      row.Flat_Facing || null,
      row.BHK_Type || null,
      row.Carpet_Area || null,
      row.Builtup_Area || null,
      row.Super_Builtup_Area || null,
      row.Additional_Area || null,
      row.Payable_Area || null,
      row.SQFT_Price || null,
      row.Basic_Cost || null,
      row.Stamp_Duty || null,
      row.Registration || null,
      row.Advocate_Fee || null,
      row.GOV_Water_Charge || null,
      row.Maintenance || null,
      row.GST || null,
      row.Other_Charges || null,
      row.Total_Cost || null,
      row.updated_at || new Date(),
      row.created_at || new Date(),
    ]);

    const query = `
      INSERT INTO propertiesinfo (
        propertyid, mouza, khasrano, wing, wingfacing, floorno, flatno, flatfacing, type,
        carpetarea, builtuparea, superbuiltuparea, additionalarea, payablearea, sqftprice, basiccost,
        stampduty, registration, advocatefee, watercharge, maintenance, gst, other, totalcost,
        updated_at, created_at
      ) VALUES ?
    `;

    db.query(query, [values], (err, result) => {
      fs.unlink(filePath, (unlinkErr) => {
        if (unlinkErr) {
          console.error("Error deleting file:", unlinkErr);
        }
      });

      if (responded) return; // Avoid duplicate response
      if (err) {
        console.error("Database error:", err);
        responded = true;
        return res.status(500).json({
          message: "Failed to insert CSV data into database.",
          error: err.sqlMessage || err.message,
        });
      }

      responded = true;
      return res.status(200).json({
        message: "CSV data inserted successfully.",
        insertedRows: result.affectedRows,
      });
    });
  });

  stream.on("error", (csvError) => {
    fs.unlink(filePath, (unlinkErr) => {
      if (unlinkErr) {
        console.error("Error deleting file after CSV error:", unlinkErr);
      }
    });

    if (!responded) {
      responded = true;
      console.error("CSV parsing error:", csvError);
      return res.status(500).json({
        message: "Error reading CSV file.",
        error: csvError.message,
      });
    }
  });
};

// Add Additional Info Using CSV
export const addCsvFileForPlot = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "CSV file is required" });
  }

  const propertyId = parseInt(req.params?.propertyid);
  if (isNaN(propertyId)) {
    return res.status(400).json({ message: "Invalid Property ID" });
  }

  const results = [];

  const filePath = req.file.path;

  const stream = fs.createReadStream(filePath).pipe(csv());

  let responded = false; // Prevent multiple responses

  stream.on("data", (row) => {
    results.push(row);
  });

  stream.on("end", () => {
    const values = results.map((row) => [
      row.propertyid || propertyId,
      row.Mouza || null,
      row.Khasra_No || null,
      row.Plot_No || null,
      row.Facing || null,
      row.Plot_Size || null,
      row.Plot_Area || null,
      row.SQFT_Price || null,
      row.Basic_Cost || null,
      row.Stamp_Duty || null,
      row.Registration || null,
      row.Advocate_Fee || null,
      row.Maintenance || null,
      row.GST || null,
      row.Other_Charges || null,
      row.Total_Cost || null,
      row.updated_at || new Date(),
      row.created_at || new Date(),
    ]);

    const query = `
      INSERT INTO propertiesinfo (
        propertyid, mouza, khasrano, plotno, plotfacing, plotsize,
        payablearea, sqftprice, basiccost,
        stampduty, registration, advocatefee, maintenance, gst, other, totalcost,
        updated_at, created_at
      ) VALUES ?
    `;

    db.query(query, [values], (err, result) => {
      fs.unlink(filePath, (unlinkErr) => {
        if (unlinkErr) {
          console.error("Error deleting file:", unlinkErr);
        }
      });

      if (responded) return; // Avoid duplicate response
      if (err) {
        console.error("Database error:", err);
        responded = true;
        return res.status(500).json({
          message: "Failed to insert CSV data into database.",
          error: err.sqlMessage || err.message,
        });
      }

      responded = true;
      return res.status(200).json({
        message: "CSV data inserted successfully.",
        insertedRows: result.affectedRows,
      });
    });
  });

  stream.on("error", (csvError) => {
    fs.unlink(filePath, (unlinkErr) => {
      if (unlinkErr) {
        console.error("Error deleting file after CSV error:", unlinkErr);
      }
    });

    if (!responded) {
      responded = true;
      console.error("CSV parsing error:", csvError);
      return res.status(500).json({
        message: "Error reading CSV file.",
        error: csvError.message,
      });
    }
  });
};

// ** Fetch Property Information by ID **
export const fetchAdditionalInfo = (req, res) => {
  const Id = parseInt(req.params.id);
  if (isNaN(Id)) {
    return res.status(400).json({ message: "Invalid Property ID" });
  }

  const sql = `SELECT * FROM propertiesinfo WHERE propertyid = ? ORDER BY propertyinfoid`;

  db.query(sql, [Id], (err, result) => {
    if (err) {
      console.error("Error fetching property Details:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    if (result.length === 0) {
      return res
        .status(404)
        .json({ message: "Property Additional Information not found" });
    }

    res.json(result); // Return only the first property
  });
};
