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

const computeTrustScore = (property) => {
  let score = 7;

  if (String(property.topPicksStatus || "").toLowerCase() === "active") {
    score += 1.5;
  }

  if (String(property.reparvAssured || "").trim()) {
    score += 0.8;
  }

  if (property.reraRegistered || property.reraStatus) {
    score += 0.7;
  }

  if (property.projectpartnerid) {
    score += 0.3;
  }

  if (String(property.hotDeal || "").toLowerCase() === "active") {
    score += 0.2;
  }

  if (
    String(property.propertyStatusFeature || "")
      .toLowerCase()
      .includes("ready to move")
  ) {
    score += 0.3;
  }

  const views = Number(property.views) || 0;
  const likes = Number(property.likes) || 0;

  if (views >= 500) score += 0.4;
  else if (views >= 200) score += 0.2;

  if (likes >= 10) score += 0.2;

  return Math.min(10, Math.round(score * 10) / 10);
};

const getScoreLabel = (score) => {
  if (score >= 9) return "Exceptional Rating";
  if (score >= 8) return "Highly Trusted";
  return "Verified Rating";
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
  const categories = new Set(properties.map((property) => property.propertyCategory));
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
  if (String([...categories].find((item) => item.startsWith("Rental")) || "")) {
    options.push("Rental");
  }

  return options;
};

const buildScoreBands = (properties) => {
  const bands = {
    exceptional: 0,
    highlyTrusted: 0,
    verified: 0,
  };

  for (const property of properties) {
    const score = property.trustScore;
    if (score >= 9) bands.exceptional += 1;
    else if (score >= 8) bands.highlyTrusted += 1;
    else bands.verified += 1;
  }

  return bands;
};

const enrichProperty = (property) => {
  const trustScore = computeTrustScore(property);

  return {
    ...property,
    trustScore,
    scoreLabel: getScoreLabel(trustScore),
  };
};

export const getTopTrustedPropertiesPageData = async (req, res) => {
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
    const enriched = propertyRows.map(formatPropertyRow).map(enrichProperty);

    const trustedProperties = enriched
      .filter(
        (property) =>
          property.topPicksStatus?.toLowerCase() === "active" ||
          property.trustScore >= 9 ||
          (property.trustScore >= 8.5 &&
            (property.reraRegistered || property.reraStatus) &&
            property.views >= 100),
      )
      .sort((a, b) => b.trustScore - a.trustScore || b.views - a.views);

    const allTrusted = trustedProperties.length
      ? trustedProperties
      : enriched.filter((property) => property.trustScore >= 8).slice(0, 50);
    const topPicksCount = allTrusted.filter(
      (property) => property.topPicksStatus?.toLowerCase() === "active",
    ).length;
    const localityKeys = new Set(
      allTrusted.map((property) => normalizeLocation(property.location)).filter(Boolean),
    );
    const avgTrustScore = allTrusted.length
      ? Math.round(
          (allTrusted.slice(0, 20).reduce((sum, property) => sum + property.trustScore, 0) /
            Math.min(allTrusted.length, 20)) *
            10,
        ) / 10
      : 9.2;

    const featuredProperties = allTrusted.slice(0, 9);
    const heroProperty = featuredProperties[0] || null;

    return res.json({
      city,
      stats: {
        trustedCount: allTrusted.length,
        topPicksCount,
        localities: localityKeys.size,
        avgTrustScore,
        reraVerified: allTrusted.filter(
          (property) => property.reraRegistered || property.reraStatus,
        ).length,
      },
      properties: allTrusted,
      featuredProperties,
      scoreBands: buildScoreBands(allTrusted),
      localities: buildLocalities(allTrusted),
      bhkOptions: buildBhkOptions(allTrusted),
      categoryOptions: buildCategoryOptions(allTrusted),
      heroProperty,
    });
  } catch (error) {
    console.error("getTopTrustedPropertiesPageData:", error);
    return res.status(500).json({
      message: "Failed to fetch top trusted properties page data",
    });
  }
};
