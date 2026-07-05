import dbPromise from "#db/promise";

const VIEWS_EXPR = "MAX(COALESCE(property_analytics.views, 0))";

const FIRST_BUYER_CATEGORIES = ["NewFlat", "ResaleFlat", "Resale", "RowHouse"];
const MAX_BUDGET = 6000000;

const STORY_TEMPLATES = [
  {
    persona: "Joint Family",
    context: "Renting",
    title: "The Path to Multi-Generational Harmony",
    clarityMoment:
      "Area comparison aligned expectations across the family. Feeling aligned mattered more than price.",
    stressPhase:
      "Repeated discussions, delays, and growing self-doubt over six months of searching.",
    points: [
      "Parents: safety & stability",
      "Spouse: location & convenience",
      "Buyer: affordability",
    ],
    tag: "Family Reflection",
  },
  {
    persona: "Nuclear Family",
    context: "IT Sector",
    title: "Overcoming Feature Creep",
    clarityMoment:
      'Separated "must-haves" from "nice-to-haves" and stopped chasing every new listing alert.',
    stressPhase: "Too many options online made every visit feel like the wrong choice.",
    points: [
      'Realized "Must-haves" vs "Nice-to-haves"',
      "Balancing commute with community",
      "Found peace in an established neighbourhood",
    ],
  },
  {
    persona: "Single Professional",
    context: "First Purchase",
    title: "Financial Readiness",
    clarityMoment:
      "Understanding the safe budget — not just the bank-approved limit — removed EMI anxiety.",
    stressPhase: "Hidden costs and loan paperwork felt overwhelming at the start.",
    points: [
      "Understanding hidden closing costs",
      'The "Safe" budget vs "Bank" budget',
      "Navigating EMI anxiety with a clear plan",
    ],
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

const isFirstBuyerProperty = (property) => {
  if (!FIRST_BUYER_CATEGORIES.includes(property.propertyCategory)) {
    return false;
  }

  const price = getPrice(property);
  if (!price || price > MAX_BUDGET) {
    return false;
  }

  const bhk = getBhkLabel(property);
  if (bhk) {
    const bhkNum = Number.parseInt(bhk, 10);
    if (bhkNum > 3) return false;
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
      });
    }

    const group = groups.get(key);
    group.properties.push(property);
    const price = getPrice(property);
    if (price > 0) group.prices.push(price);
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
        sampleSlug: group.properties[0]?.seoSlug || null,
        sampleFrontView: group.properties[0]?.frontView || null,
      };
    });
};

const buildStories = (properties, areas) => {
  return STORY_TEMPLATES.map((template, index) => {
    const area = areas[index] || areas[0];
    const sample = properties[index] || properties[0] || null;
    const location = area?.name || titleCaseLocation(sample?.location) || "Nagpur";

    return {
      ...template,
      meta: `${template.persona} · ${location} · ${template.context}`,
      location,
      priceRange: area?.priceRange || (sample ? formatPriceShort(getPrice(sample)) : null),
      propertySlug: sample?.seoSlug || area?.sampleSlug || null,
      image: sample?.frontView || area?.sampleFrontView || null,
      href: sample?.seoSlug
        ? `/property-info/${sample.seoSlug}`
        : area?.sampleSlug
          ? `/property-info/${area.sampleSlug}`
          : "/properties?city=Nagpur",
    };
  });
};

const buildFeaturedStory = (properties, areas, stories) => {
  const featured = stories[0] || null;
  const sample = properties[0] || null;
  const area = areas[0] || null;

  if (!featured) {
    return {
      tags: ["Joint Family", "Renting"],
      title: "The Path to Multi-Generational Harmony",
      clarityMoment:
        "Area comparison aligned expectations across the family. Feeling aligned mattered more than price.",
      stressPhase:
        "Repeated discussions, delays, and growing self-doubt over six months of searching.",
      image: "/assets/seoPages/firstTimeBuyer/leftImage.svg",
      href: "/properties?city=Nagpur",
    };
  }

  return {
    tags: [featured.persona, featured.context],
    title: featured.title,
    clarityMoment: featured.clarityMoment,
    stressPhase: featured.stressPhase,
    location: featured.location,
    priceRange: featured.priceRange,
    image: featured.image || area?.sampleFrontView || sample?.frontView || null,
    href: featured.href,
  };
};

export const getFirstTimeBuyerPageData = async (req, res) => {
  try {
    const city = String(req.params.city || "").trim();
    if (!city) {
      return res.status(400).json({ message: "City is required" });
    }

    const categoryPlaceholders = FIRST_BUYER_CATEGORIES.map(() => "?").join(", ");

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
      ...FIRST_BUYER_CATEGORIES,
    ]);

    const allProperties = propertyRows.map(formatPropertyRow);
    const starterProperties = allProperties
      .filter(isFirstBuyerProperty)
      .sort((a, b) => getPrice(a) - getPrice(b));

    const affordableFallback = allProperties
      .filter((property) => {
        const price = getPrice(property);
        return price > 0 && price <= MAX_BUDGET;
      })
      .slice(0, 20);

    const sourceProperties =
      starterProperties.length >= 3 ? starterProperties : affordableFallback;

    const popularAreas = buildPopularAreas(sourceProperties);
    const stories = buildStories(sourceProperties, popularAreas);
    const featuredStory = buildFeaturedStory(sourceProperties, popularAreas, stories);

    const prices = sourceProperties.map(getPrice).filter((value) => value > 0);
    const localityKeys = new Set(
      sourceProperties
        .map((property) => normalizeLocation(property.location))
        .filter(Boolean),
    );

    const oneBhkCount = sourceProperties.filter((property) => {
      const bhk = getBhkLabel(property);
      return bhk && Number.parseInt(bhk, 10) === 1;
    }).length;

    const twoBhkCount = sourceProperties.filter((property) => {
      const bhk = getBhkLabel(property);
      const num = Number.parseInt(bhk || "", 10);
      return num === 2 || num === 2.5;
    }).length;

    return res.json({
      city,
      stats: {
        affordableHomes: sourceProperties.length,
        localities: localityKeys.size,
        minPrice: prices.length ? Math.min(...prices) : null,
        maxPrice: prices.length ? Math.max(...prices) : null,
        oneBhkCount,
        twoBhkCount,
      },
      featuredStory,
      stories: stories.slice(1),
      popularAreas,
      starterProperties: sourceProperties.slice(0, 6),
      heroProperty: sourceProperties[0] || null,
    });
  } catch (error) {
    console.error("getFirstTimeBuyerPageData:", error);
    return res.status(500).json({
      message: "Failed to fetch first time buyer page data",
    });
  }
};
