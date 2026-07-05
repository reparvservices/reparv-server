import dbPromise from "#db/promise";

const VIEWS_EXPR = "MAX(COALESCE(property_analytics.views, 0))";

const FLAT_CATEGORIES = ["NewFlat", "ResaleFlat", "Resale", "RowHouse"];

const AREA_THEMES = [
  {
    priceColor: "#5E23DC",
    borderColor: "#5E23DC",
    iconBg: "rgba(94,35,220,0.1)",
    linkColor: "#5E23DC",
  },
  {
    priceColor: "#2563EB",
    borderColor: "#3B82F6",
    iconBg: "#DBEAFE",
    linkColor: "#2563EB",
  },
  {
    priceColor: "#EA580C",
    borderColor: "#F97316",
    iconBg: "#FFEDD5",
    linkColor: "#EA580C",
  },
  {
    priceColor: "#4F46E5",
    borderColor: "#6366F1",
    iconBg: "#E0E7FF",
    linkColor: "#4F46E5",
  },
  {
    priceColor: "#9333EA",
    borderColor: "#A855F7",
    iconBg: "#F3E8FF",
    linkColor: "#9333EA",
  },
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

const isFlatProperty = (property) =>
  FLAT_CATEGORIES.includes(property.propertyCategory);

const getPricePerSqft = (property) => {
  const price = Number(property.totalOfferPrice || property.totalSalesPrice);
  const area = Number(property.carpetArea || property.builtUpArea);

  if (!price || !area) return null;
  return price / area;
};

const formatSqftPrice = (value) => {
  const price = Number(value);
  if (!price || Number.isNaN(price)) return null;

  if (price >= 1000) {
    return `₹${(price / 1000).toFixed(1).replace(/\.0$/, "")}k/sqft`;
  }

  return `₹${Math.round(price)}/sqft`;
};

const getBhkLabel = (property) => {
  const types = Array.isArray(property.propertyType) ? property.propertyType : [];
  const bhk = types.find((item) => /bhk/i.test(String(item)));

  if (bhk) return bhk;

  return property.propertyCategory === "RowHouse" ? "Row House" : "Flat";
};

const getProjectBadge = (property) => {
  const status = String(property.propertyStatusFeature || "").toLowerCase();

  if (status.includes("ready to move")) {
    return { badge: "Ready", badgeBg: "#10B981" };
  }

  if (property.hotDeal?.toLowerCase() === "active") {
    return { badge: "Hot Deal", badgeBg: "#EF4444" };
  }

  if (property.propertyCategory === "NewFlat") {
    return { badge: "New Launch", badgeBg: "#5E23DC" };
  }

  return { badge: "Pre Launch", badgeBg: "#F97316" };
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

const buildPopularAreas = (properties) => {
  const groups = new Map();

  for (const property of properties) {
    const key = normalizeLocation(property.location);
    if (!key) continue;

    if (!groups.has(key)) {
      groups.set(key, {
        name: titleCaseLocation(property.location),
        properties: [],
        sqftPrices: [],
        distances: [],
      });
    }

    const group = groups.get(key);
    group.properties.push(property);

    const sqftPrice = getPricePerSqft(property);
    if (sqftPrice) group.sqftPrices.push(sqftPrice);

    const distance = Number(property.distanceFromCityCenter);
    if (!Number.isNaN(distance) && distance > 0) {
      group.distances.push(distance);
    }
  }

  return Array.from(groups.values())
    .sort((a, b) => b.properties.length - a.properties.length)
    .slice(0, 5)
    .map((group, index) => {
      const theme = AREA_THEMES[index % AREA_THEMES.length];
      const minSqft = group.sqftPrices.length
        ? Math.min(...group.sqftPrices)
        : null;
      const maxSqft = group.sqftPrices.length
        ? Math.max(...group.sqftPrices)
        : null;

      const highlights = [`${group.properties.length} verified flats listed`];

      if (group.distances.length) {
        const avgDistance = (
          group.distances.reduce((sum, value) => sum + value, 0) /
          group.distances.length
        ).toFixed(1);
        highlights.push(`About ${avgDistance} km from city center`);
      }

      highlights.push("RERA-verified listings available");

      let priceRange = "Price on request";
      if (minSqft && maxSqft) {
        priceRange =
          minSqft === maxSqft
            ? formatSqftPrice(minSqft)
            : `${formatSqftPrice(minSqft)} - ${formatSqftPrice(maxSqft)}`;
      }

      return {
        name: group.name,
        count: group.properties.length,
        priceRange,
        minPricePerSqft: minSqft ? Math.round(minSqft) : null,
        maxPricePerSqft: maxSqft ? Math.round(maxSqft) : null,
        highlights: highlights.slice(0, 3),
        ...theme,
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
        label: `Flats in ${titleCaseLocation(property.location)}`,
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

const buildUpcomingProjects = (properties, limit = 6) => {
  return properties
    .filter((property) => {
      const status = String(property.propertyStatusFeature || "").toLowerCase();
      return (
        status.includes("under construction") ||
        (property.propertyCategory === "NewFlat" &&
          !status.includes("ready to move"))
      );
    })
    .slice(0, limit)
    .map((property) => {
      const badge = getProjectBadge(property);
      const bhkTypes = buildBhkOptions([property]);
      const location = titleCaseLocation(property.location);
      const price = Number(property.totalOfferPrice || property.totalSalesPrice);

      let priceOrDate = "Price on request";
      if (price) {
        priceOrDate = `Starting from ₹${Math.round(price / 100000)} Lacs`;
      } else if (property.possessionDate) {
        priceOrDate = `Possession: ${property.possessionDate}`;
      }

      return {
        propertyid: property.propertyid,
        seoSlug: property.seoSlug,
        badge: badge.badge,
        badgeBg: badge.badgeBg,
        name: property.propertyName,
        sub: `${location}${bhkTypes.length ? ` | ${bhkTypes.join(", ")}` : ""}`,
        priceOrDate,
        frontView: property.frontView,
      };
    });
};

export const getFlatsForSalePageData = async (req, res) => {
  try {
    const city = String(req.params.city || "").trim();
    if (!city) {
      return res.status(400).json({ message: "City is required" });
    }

    const categoryPlaceholders = FLAT_CATEGORIES.map(() => "?").join(", ");

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
      ...FLAT_CATEGORIES,
    ]);

    const flats = propertyRows.map(formatPropertyRow);
    const localityKeys = new Set(
      flats.map((property) => normalizeLocation(property.location)).filter(Boolean),
    );

    const sqftPrices = flats
      .map(getPricePerSqft)
      .filter((value) => value && !Number.isNaN(value));

    const readyToMove = flats.filter((property) =>
      String(property.propertyStatusFeature || "")
        .toLowerCase()
        .includes("ready to move"),
    ).length;

    const underConstruction = flats.filter((property) =>
      String(property.propertyStatusFeature || "")
        .toLowerCase()
        .includes("under construction"),
    ).length;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const newListingsToday = flats.filter((property) => {
      const createdAt = new Date(property.created_at);
      return createdAt >= today;
    }).length;

    const featuredFlats = flats.slice(0, 8);
    const heroProperty = featuredFlats[0] || null;

    return res.json({
      city,
      stats: {
        flatListings: flats.length,
        localities: localityKeys.size,
        readyToMove,
        underConstruction,
        minPricePerSqft: sqftPrices.length
          ? Math.round(Math.min(...sqftPrices))
          : null,
        newListingsToday,
      },
      flats,
      featuredFlats,
      upcomingProjects: buildUpcomingProjects(flats),
      popularAreas: buildPopularAreas(flats),
      areaLinks: buildAreaLinks(flats),
      localities: buildLocalities(flats),
      bhkOptions: buildBhkOptions(flats),
      heroProperty,
    });
  } catch (error) {
    console.error("getFlatsForSalePageData:", error);
    return res.status(500).json({
      message: "Failed to fetch flats for sale page data",
    });
  }
};
