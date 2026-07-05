import dbPromise from "#db/promise";

const VIEWS_EXPR = "MAX(COALESCE(property_analytics.views, 0))";

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

const CATEGORY_CONFIG = [
  {
    label: "Flats for Sale",
    href: "/flats-for-sale-in-nagpur",
    matches: (property) =>
      ["NewFlat", "ResaleFlat", "Resale", "RowHouse"].includes(
        property.propertyCategory,
      ),
  },
  {
    label: "Plots for Sale",
    href: "/plots-for-sale-in-nagpur",
    matches: (property) =>
      ["NewPlot", "CommercialPlot", "FarmLand", "FarmHouse"].includes(
        property.propertyCategory,
      ),
  },
  {
    label: "Rental Properties",
    href: "/rental-properties",
    matches: (property) =>
      String(property.propertyCategory || "").startsWith("Rental"),
  },
  {
    label: "New Projects",
    href: "/buy-new-property",
    matches: (property) =>
      property.propertyCategory === "NewFlat" &&
      String(property.propertyStatusFeature || "")
        .toLowerCase()
        .includes("under construction"),
  },
  {
    label: "Ready to Move",
    href: "/ready-to-move-properties-in-nagpur",
    matches: (property) =>
      String(property.propertyStatusFeature || "")
        .toLowerCase()
        .includes("ready to move"),
  },
];

function buildCategories(properties) {
  return CATEGORY_CONFIG.map((category) => ({
    label: category.label,
    href: category.href,
    count: properties.filter(category.matches).length,
  })).filter((category) => category.count > 0);
}

function buildLocalities(properties, limit = 12) {
  const groups = new Map();

  for (const property of properties) {
    const key = normalizeLocation(property.location);
    if (!key) continue;

    if (!groups.has(key)) {
      groups.set(key, {
        name: titleCaseLocation(property.location),
        count: 0,
      });
    }

    groups.get(key).count += 1;
  }

  return Array.from(groups.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((item) => item.name);
}

export const getVerifiedPropertiesPageData = async (req, res) => {
  try {
    const city = String(req.params.city || "").trim();
    if (!city) {
      return res.status(400).json({ message: "City is required" });
    }

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
      GROUP BY p.propertyid
      ORDER BY views DESC, p.propertyid DESC
    `;

    const [propertyRows] = await dbPromise.query(propertiesSql, [city]);
    const properties = propertyRows.map(formatPropertyRow);
    const localityCount = new Set(
      properties
        .map((property) => normalizeLocation(property.location))
        .filter(Boolean),
    ).size;

    const featuredProperties = properties.slice(0, 6);
    const heroProperty = featuredProperties[0] || null;

    return res.json({
      city,
      stats: {
        verifiedListings: properties.length,
        localities: localityCount,
      },
      categories: buildCategories(properties),
      featuredProperties,
      heroProperty,
      localities: buildLocalities(properties),
    });
  } catch (error) {
    console.error("getVerifiedPropertiesPageData:", error);
    return res.status(500).json({
      message: "Failed to fetch verified properties page data",
    });
  }
};
