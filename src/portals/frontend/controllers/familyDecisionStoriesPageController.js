import dbPromise from "#db/promise";

const VIEWS_EXPR = "MAX(COALESCE(property_analytics.views, 0))";

const FAMILY_CATEGORIES = ["NewFlat", "ResaleFlat", "Resale", "RowHouse"];
const MAX_BUDGET = 8000000;

const STORY_TEMPLATES = [
  {
    seed: 0,
    metaTags: ["Joint Family", "Renting"],
    title: "The Family Alignment Journey",
    videoLabel: "Family Reflection",
    videoDuration: "2:45",
    videoCaption: "Optional short reflection from the family.",
    priorities: [
      "Parents: safety & stability",
      "Spouse: location & convenience",
      "Buyer: affordability",
    ],
    stressPhase: "Repeated discussions, delays, and growing self-doubt.",
    clarityMoment: "Area comparison aligned expectations across the family.",
    clarityOutcome: "Feeling aligned mattered more than price.",
    gradientFrom: "#C8DDEF",
    gradientTo: "#D8E8F4",
  },
  {
    seed: 1,
    metaTags: ["Nuclear Family", "Buying"],
    title: "Finding Shared Priorities",
    videoLabel: "Watch Reflection",
    videoDuration: "3:12",
    videoCaption: "Navigating the perfect-home search together.",
    priorities: [
      "Parents: closeness to schools",
      "Spouse: daily commute & lifestyle",
      "Buyer: long-term value",
    ],
    stressPhase: "Conflict over location vs amenities led to a long pause.",
    clarityMoment:
      "Structured guidance helped prioritize needs over wish-list features.",
    clarityOutcome: "We realized joy at home mattered more than square footage.",
    gradientFrom: "#C8D8E8",
    gradientTo: "#D4E0EC",
  },
  {
    seed: 2,
    metaTags: ["Growing Family", "Planning"],
    title: "Balancing Safety and Budget",
    videoLabel: "Family Decision",
    videoDuration: "2:20",
    videoCaption: "How one family compared communities before deciding.",
    priorities: [
      "Safe neighbourhood for children",
      "Affordable monthly EMI",
      "Room to grow over 5 years",
    ],
    stressPhase: "Conflicting expectations from relatives added emotional pressure.",
    clarityMoment:
      "Comparing three localities side-by-side removed guesswork for everyone.",
    clarityOutcome: "A balanced choice emerged that the whole family supported.",
    gradientFrom: "#DDD5FF",
    gradientTo: "#EBE5FF",
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

const getPrice = (property) =>
  Number(property.totalOfferPrice || property.totalSalesPrice);

const getBhkLabel = (property) => {
  const types = Array.isArray(property.propertyType) ? property.propertyType : [];
  const bhk = types.find((item) => /bhk/i.test(String(item)));
  return bhk || null;
};

const isFamilyHome = (property) => {
  if (!FAMILY_CATEGORIES.includes(property.propertyCategory)) {
    return false;
  }

  const price = getPrice(property);
  if (!price || price > MAX_BUDGET) {
    return false;
  }

  const bhk = getBhkLabel(property);
  if (bhk) {
    const bhkNum = Number.parseInt(bhk, 10);
    if (bhkNum < 2 || bhkNum > 4) return false;
  }

  return true;
};

const formatPriceShort = (price) => {
  const value = Number(price);
  if (!value) return "Price on request";
  if (value >= 100000) return `₹${Math.round(value / 100000)} Lakh`;
  return `₹${Math.round(value / 1000)}k`;
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
        bhkTypes: new Set(),
      });
    }

    const group = groups.get(key);
    group.properties.push(property);

    const price = getPrice(property);
    if (price > 0) group.prices.push(price);

    const bhk = getBhkLabel(property);
    if (bhk) group.bhkTypes.add(bhk);
  }

  return Array.from(groups.values())
    .sort((a, b) => b.properties.length - a.properties.length)
    .slice(0, 6)
    .map((group) => {
      const minPrice = group.prices.length ? Math.min(...group.prices) : null;
      const maxPrice = group.prices.length ? Math.max(...group.prices) : null;

      return {
        name: group.name,
        count: group.properties.length,
        priceRange:
          minPrice && maxPrice
            ? minPrice === maxPrice
              ? formatPriceShort(minPrice)
              : `${formatPriceShort(minPrice)} - ${formatPriceShort(maxPrice)}`
            : "Price on request",
        bhkOptions: Array.from(group.bhkTypes).slice(0, 3),
        sampleSlug: group.properties[0]?.seoSlug || null,
        sampleFrontView: group.properties[0]?.frontView || null,
      };
    });
};

const buildStories = (properties, areas, city) => {
  return STORY_TEMPLATES.map((template, index) => {
    const area = areas[index] || areas[0];
    const sample = properties[index] || properties[0] || null;
    const location = area?.name || titleCaseLocation(sample?.location) || city;
    const meta = [template.metaTags[0], location, template.metaTags[1]];

    return {
      ...template,
      meta,
      location,
      title: `${template.title} in ${location}`,
      priceRange: area?.priceRange || (sample ? formatPriceShort(getPrice(sample)) : null),
      propertySlug: sample?.seoSlug || area?.sampleSlug || null,
      image: sample?.frontView || area?.sampleFrontView || null,
      href: sample?.seoSlug
        ? `/property-info/${sample.seoSlug}`
        : area?.sampleSlug
          ? `/property-info/${area.sampleSlug}`
          : `/properties?city=${encodeURIComponent(city)}&location=${encodeURIComponent(location)}`,
    };
  });
};

export const getFamilyDecisionStoriesPageData = async (req, res) => {
  try {
    const city = String(req.params.city || "").trim();
    if (!city) {
      return res.status(400).json({ message: "City is required" });
    }

    const categoryPlaceholders = FAMILY_CATEGORIES.map(() => "?").join(", ");

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
      ...FAMILY_CATEGORIES,
    ]);

    const allProperties = propertyRows.map(formatPropertyRow);
    let familyHomes = allProperties.filter(isFamilyHome);

    if (familyHomes.length < 3) {
      familyHomes = allProperties
        .filter((property) => {
          const price = getPrice(property);
          return price > 0 && price <= MAX_BUDGET;
        })
        .slice(0, 30);
    }

    const popularAreas = buildPopularAreas(familyHomes);
    const stories = buildStories(familyHomes, popularAreas, city);

    const prices = familyHomes.map(getPrice).filter((value) => value > 0);
    const localityKeys = new Set(
      familyHomes.map((property) => normalizeLocation(property.location)).filter(Boolean),
    );

    const twoBhkCount = familyHomes.filter((property) => {
      const bhk = getBhkLabel(property);
      const num = Number.parseInt(bhk || "", 10);
      return num === 2 || num === 2.5;
    }).length;

    const threeBhkCount = familyHomes.filter((property) => {
      const bhk = getBhkLabel(property);
      return Number.parseInt(bhk || "", 10) === 3;
    }).length;

    return res.json({
      city,
      stats: {
        familyHomes: familyHomes.length,
        localities: localityKeys.size,
        minPrice: prices.length ? Math.min(...prices) : null,
        maxPrice: prices.length ? Math.max(...prices) : null,
        twoBhkCount,
        threeBhkCount,
      },
      stories,
      popularAreas,
      heroProperty: familyHomes[0] || null,
    });
  } catch (error) {
    console.error("getFamilyDecisionStoriesPageData:", error);
    return res.status(500).json({
      message: "Failed to fetch family decision stories page data",
    });
  }
};
