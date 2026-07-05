import dbPromise from "#db/promise";

const VIEWS_EXPR = "MAX(COALESCE(property_analytics.views, 0))";

const AREA_THEMES = [
  { idealFor: "Families", priceColor: "#5E23DC" },
  { idealFor: "Professionals", priceColor: "#2563EB" },
  { idealFor: "Budget Buyers", priceColor: "#EA580C" },
  { idealFor: "Investors", priceColor: "#4F46E5" },
  { idealFor: "End Users", priceColor: "#9333EA" },
];

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

const getBhkLabel = (property) => {
  const types = Array.isArray(property.propertyType) ? property.propertyType : [];
  const bhk = types.find((item) => /bhk/i.test(String(item)));
  if (bhk) return bhk;
  if (property.propertyCategory === "RowHouse") return "Row House";
  if (["NewPlot", "CommercialPlot", "FarmLand", "FarmHouse"].includes(property.propertyCategory)) {
    return "Plot";
  }
  return "Ready Home";
};

const getPrice = (property) =>
  Number(property.totalOfferPrice || property.totalSalesPrice);

const formatHeroPrice = (property) => {
  const price = getPrice(property);
  if (!price) return "Price on request";
  if (price >= 100000) return `₹${Math.round(price / 100000)} Lakh`;
  return `₹${Math.round(price / 1000)}k`;
};

const buildBhkOptions = (properties) => {
  const options = new Set();

  for (const property of properties) {
    const types = Array.isArray(property.propertyType) ? property.propertyType : [];
    for (const type of types) {
      if (/bhk/i.test(String(type))) {
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

const buildCategoryOptions = (properties) => {
  const categories = new Set();

  for (const property of properties) {
    categories.add(property.propertyCategory);
  }

  const options = ["Any"];

  if (["NewFlat", "ResaleFlat", "Resale"].some((item) => categories.has(item))) {
    options.push("Flat");
  }
  if (categories.has("RowHouse")) options.push("Row House");
  if (
    ["NewPlot", "CommercialPlot", "FarmLand", "FarmHouse"].some((item) =>
      categories.has(item),
    )
  ) {
    options.push("Plot");
  }
  if (categories.has("CommercialFlat")) options.push("Commercial");

  return options;
};

const buildHeroHomes = (properties, limit = 3) => {
  return properties.slice(0, limit).map((property) => {
    const bhk = getBhkLabel(property);
    const location = titleCaseLocation(property.location);

    return {
      propertyid: property.propertyid,
      seoSlug: property.seoSlug,
      title: `${bhk} Ready - ${location}`,
      price: formatHeroPrice(property),
      frontView: property.frontView,
    };
  });
};

const buildPopularAreas = (properties) => {
  const groups = new Map();

  for (const property of properties) {
    const key = normalizeLocation(property.location);
    if (!key) continue;

    if (!groups.has(key)) {
      groups.set(key, {
        name: titleCaseLocation(property.location),
        properties: [],
        prices: [],
        sampleFrontView: property.frontView,
      });
    }

    const group = groups.get(key);
    group.properties.push(property);

    const price = getPrice(property);
    if (price > 0) group.prices.push(price);

    if (!group.sampleFrontView && property.frontView) {
      group.sampleFrontView = property.frontView;
    }
  }

  return Array.from(groups.values())
    .sort((a, b) => b.properties.length - a.properties.length)
    .slice(0, 4)
    .map((group, index) => {
      const theme = AREA_THEMES[index % AREA_THEMES.length];
      const minPrice = group.prices.length ? Math.min(...group.prices) : null;
      const maxPrice = group.prices.length ? Math.max(...group.prices) : null;

      const points = [
        `${group.properties.length} verified ready ${group.properties.length === 1 ? "home" : "homes"}`,
        "Immediate possession available",
        "Zero GST on completed properties",
      ];

      let priceLabel = "Price on request";
      if (minPrice && maxPrice) {
        priceLabel =
          minPrice === maxPrice
            ? formatHeroPrice({ totalOfferPrice: minPrice })
            : `${formatHeroPrice({ totalOfferPrice: minPrice })} - ${formatHeroPrice({ totalOfferPrice: maxPrice })}`;
      }

      return {
        name: group.name,
        idealFor: theme.idealFor,
        count: group.properties.length,
        priceLabel,
        points,
        sampleFrontView: group.sampleFrontView,
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
        label: `Ready Homes in ${titleCaseLocation(property.location)}`,
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

export const getReadyToMovePageData = async (req, res) => {
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
        AND LOWER(COALESCE(p.propertyStatusFeature, '')) LIKE '%ready to move%'
        AND p.propertyCategory NOT LIKE 'Rental%'
      GROUP BY p.propertyid
      ORDER BY views DESC, p.propertyid DESC
    `;

    const [propertyRows] = await dbPromise.query(propertiesSql, [city]);
    const properties = propertyRows.map(formatPropertyRow);

    const localityKeys = new Set(
      properties.map((property) => normalizeLocation(property.location)).filter(Boolean),
    );

    const prices = properties.map(getPrice).filter((value) => value > 0);
    const flatCount = properties.filter((property) =>
      ["NewFlat", "ResaleFlat", "Resale", "RowHouse"].includes(property.propertyCategory),
    ).length;
    const plotCount = properties.filter((property) =>
      ["NewPlot", "CommercialPlot", "FarmLand", "FarmHouse"].includes(property.propertyCategory),
    ).length;

    const featuredProperties = properties.slice(0, 8);
    const heroProperty = featuredProperties[0] || null;

    return res.json({
      city,
      stats: {
        propertyCount: properties.length,
        flatCount,
        plotCount,
        localities: localityKeys.size,
        minPrice: prices.length ? Math.min(...prices) : null,
        maxPrice: prices.length ? Math.max(...prices) : null,
      },
      properties,
      featuredProperties,
      heroHomes: buildHeroHomes(properties),
      popularAreas: buildPopularAreas(properties),
      areaLinks: buildAreaLinks(properties),
      localities: buildLocalities(properties),
      bhkOptions: buildBhkOptions(properties),
      categoryOptions: buildCategoryOptions(properties),
      heroProperty,
    });
  } catch (error) {
    console.error("getReadyToMovePageData:", error);
    return res.status(500).json({
      message: "Failed to fetch ready to move page data",
    });
  }
};
