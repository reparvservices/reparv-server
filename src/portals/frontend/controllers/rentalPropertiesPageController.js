import dbPromise from "#db/promise";

const VIEWS_EXPR = "MAX(COALESCE(property_analytics.views, 0))";

const RENTAL_CATEGORIES = [
  "RentalFlat",
  "RentalOffice",
  "RentalShop",
  "RentalGodown",
];

const RESIDENTIAL_RENTAL = ["RentalFlat"];

const CATEGORY_LABELS = {
  RentalFlat: "Rental Flat",
  RentalOffice: "Rental Office",
  RentalShop: "Rental Shop",
  RentalGodown: "Rental Godown",
};

const formatPropertyRow = (row) => {
  let parsedType = [];

  try {
    parsedType = row.propertyType ? JSON.parse(row.propertyType) : [];
  } catch {
    parsedType = [];
  }

  return {
    ...row,
    propertyType: parsedType,
    likes: Number(row.likes) || 0,
    views: Number(row.views) || 0,
  };
};

const normalizeLocation = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();

const titleCaseLocation = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

const getMonthlyRent = (property) => {
  const rent = Number(property.totalOfferPrice || property.totalSalesPrice);
  if (!rent || rent <= 0 || rent > 100000) return null;
  return rent;
};

const getPlotArea = (property) => {
  const area = Number(
    property.carpetArea || property.builtUpArea || property.sizeAreaFeature,
  );
  return area > 0 ? Math.round(area) : null;
};

const buildLocalities = (properties, limit = 12) => {
  const groups = new Map();

  for (const property of properties) {
    const key = normalizeLocation(property.location);
    if (!key) continue;

    if (!groups.has(key)) {
      groups.set(key, titleCaseLocation(property.location));
    }
  }

  return Array.from(groups.values()).slice(0, limit);
};

const buildBhkOptions = (properties) => {
  const options = new Set();

  for (const property of properties) {
    const types = Array.isArray(property.propertyType) ? property.propertyType : [];
    for (const type of types) {
      if (/bhk|room|pg/i.test(String(type))) {
        options.add(String(type).trim());
      }
    }
  }

  return Array.from(options).sort((a, b) => {
    const aNum = Number.parseInt(a, 10) || 0;
    const bNum = Number.parseInt(b, 10) || 0;
    return aNum - bNum;
  });
};

const buildPropertyTypeOptions = (properties) => {
  const options = new Set(["Flat"]);

  for (const property of properties) {
    if (property.propertyCategory === "RentalFlat") {
      options.add("Flat");
    }
    if (
      property.propertyCategory === "RentalOffice" ||
      property.propertyCategory === "RentalShop" ||
      property.propertyCategory === "RentalGodown"
    ) {
      options.add("Commercial");
    }
  }

  if (properties.some((property) => getMonthlyRent(property) && getMonthlyRent(property) <= 15000)) {
    options.add("PG");
  }

  return Array.from(options);
};

const buildPopularAreas = (properties) => {
  const groups = new Map();

  for (const property of properties) {
    const key = normalizeLocation(property.location);
    if (!key) continue;

    if (!groups.has(key)) {
      groups.set(key, {
        name: titleCaseLocation(property.location),
        rents: [],
        count: 0,
        bhkTypes: new Set(),
      });
    }

    const group = groups.get(key);
    group.count += 1;

    const rent = getMonthlyRent(property);
    if (rent) group.rents.push(rent);

    const types = Array.isArray(property.propertyType) ? property.propertyType : [];
    for (const type of types) {
      if (/bhk/i.test(String(type))) {
        group.bhkTypes.add(String(type).trim());
      }
    }
  }

  return Array.from(groups.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
    .map((group) => {
      const avgRent = group.rents.length
        ? Math.round(
            group.rents.reduce((sum, value) => sum + value, 0) / group.rents.length,
          )
        : null;

      const minRent = group.rents.length ? Math.min(...group.rents) : null;
      const maxRent = group.rents.length ? Math.max(...group.rents) : null;
      const bhkList = Array.from(group.bhkTypes).slice(0, 2);

      return {
        name: group.name,
        subtitle: "Nagpur",
        avgRent: avgRent ? `₹${avgRent.toLocaleString("en-IN")}` : "On request",
        listings: `${group.count} listings`,
        detail1: `${group.count} verified rental ${group.count === 1 ? "listing" : "listings"} available`,
        detail2:
          minRent && maxRent
            ? `${bhkList.join(", ") || "Homes"} avg. ₹${minRent.toLocaleString("en-IN")}–₹${maxRent.toLocaleString("en-IN")}/month`
            : "Multiple BHK options available",
        count: group.count,
      };
    });
};

const buildAreaLinks = (properties, limit = 8) => {
  const groups = new Map();

  for (const property of properties) {
    const key = normalizeLocation(property.location);
    if (!key) continue;

    if (!groups.has(key)) {
      groups.set(key, {
        label: `Rentals in ${titleCaseLocation(property.location)}`,
        location: titleCaseLocation(property.location),
        count: 0,
      });
    }

    groups.get(key).count += 1;
  }

  return Array.from(groups.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
};

export const getRentalPropertiesPageData = async (req, res) => {
  try {
    const city = String(req.params.city || "").trim();
    if (!city) {
      return res.status(400).json({ message: "City is required" });
    }

    const categoryPlaceholders = RENTAL_CATEGORIES.map(() => "?").join(", ");

    const propertiesSql = `
      SELECT
        p.*,
        pp.fullname AS partnerName,
        ${VIEWS_EXPR} AS views,
        COUNT(DISTINCT user_property_wishlist.guest_user_id) AS likes
      FROM properties p
      LEFT JOIN projectpartner pp ON pp.id = p.projectpartnerid
      LEFT JOIN property_analytics
        ON property_analytics.property_id = p.propertyid
      LEFT JOIN user_property_wishlist
        ON user_property_wishlist.property_id = p.propertyid
      WHERE p.status = 'Active'
        AND p.approve = 'Approved'
        AND TRIM(p.city) = ?
        AND p.propertyCategory IN (${categoryPlaceholders})
      GROUP BY p.propertyid
      ORDER BY views DESC, p.propertyid DESC
    `;

    const [propertyRows] = await dbPromise.query(propertiesSql, [
      city,
      ...RENTAL_CATEGORIES,
    ]);

    const rentals = propertyRows.map(formatPropertyRow);
    const localityKeys = new Set(
      rentals
        .map((property) => normalizeLocation(property.location))
        .filter(Boolean),
    );

    const monthlyRents = rentals
      .map(getMonthlyRent)
      .filter((value) => value && !Number.isNaN(value));

    const residentialCount = rentals.filter((property) =>
      RESIDENTIAL_RENTAL.includes(property.propertyCategory),
    ).length;

    const commercialCount = rentals.filter((property) =>
      ["RentalOffice", "RentalShop", "RentalGodown"].includes(
        property.propertyCategory,
      ),
    ).length;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const newListingsToday = rentals.filter((property) => {
      const createdAt = new Date(property.created_at);
      return createdAt >= today;
    }).length;

    const featuredRentals = rentals.slice(0, 8);
    const heroProperty = featuredRentals[0] || null;

    return res.json({
      city,
      stats: {
        rentalListings: rentals.length,
        localities: localityKeys.size,
        residentialRentals: residentialCount,
        commercialRentals: commercialCount,
        minMonthlyRent: monthlyRents.length ? Math.min(...monthlyRents) : null,
        maxMonthlyRent: monthlyRents.length ? Math.max(...monthlyRents) : null,
        avgMonthlyRent: monthlyRents.length
          ? Math.round(
              monthlyRents.reduce((sum, value) => sum + value, 0) /
                monthlyRents.length,
            )
          : null,
        newListingsToday,
      },
      rentals,
      featuredRentals,
      popularAreas: buildPopularAreas(rentals),
      areaLinks: buildAreaLinks(rentals),
      localities: buildLocalities(rentals),
      bhkOptions: buildBhkOptions(rentals),
      propertyTypeOptions: buildPropertyTypeOptions(rentals),
      heroProperty,
    });
  } catch (error) {
    console.error("getRentalPropertiesPageData:", error);
    return res.status(500).json({
      message: "Failed to fetch rental properties page data",
    });
  }
};
