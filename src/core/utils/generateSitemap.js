export default function generateSitemap({ properties = [], blogs = [], news = [] }) {
  const BASE_URL = "https://www.reparv.in";
  const urls = [];

  const formatDate = (date) => {
    if (!date) return new Date().toISOString();
    return new Date(date).toISOString();
  };

  const createUrl = (loc, lastmod, priority = "0.8", freq = "daily") => `
    <url>
      <loc>${loc}</loc>
      <lastmod>${lastmod}</lastmod>
      <changefreq>${freq}</changefreq>
      <priority>${priority}</priority>
    </url>
  `;

  const staticPages = [
    { path: "/", priority: "1.0" },
    { path: "/about-us", priority: "0.8" },
    { path: "/blogs", priority: "0.9" },
    { path: "/contact-us", priority: "0.8" },
    { path: "/cost-calculator", priority: "0.8" },
    { path: "/emi-calculator", priority: "0.8" },
    { path: "/news", priority: "0.9" },
    { path: "/properties", priority: "0.9" },
    { path: "/rera-properties", priority: "0.8" },
    { path: "/trusted-builders", priority: "0.8" },
    { path: "/verify-7-12", priority: "0.8" },
    { path: "/visit-properties-on-week-ends", priority: "0.8" },
  ];

  const STATIC_DATE = new Date().toISOString();
  staticPages.forEach((p) => {
    urls.push(createUrl(`${BASE_URL}${p.path}`, STATIC_DATE, p.priority));
  });

  properties.forEach((p) => {
    if (!p?.seoSlug) return;
    urls.push(
      createUrl(
        `${BASE_URL}/property-info/${p.seoSlug}`,
        formatDate(p.updatedAt),
        "0.9",
      ),
    );
  });

  blogs.forEach((b) => {
    if (!b?.seoSlug) return;
    urls.push(
      createUrl(`${BASE_URL}/blog/${b.seoSlug}`, formatDate(b.updatedAt), "0.8"),
    );
  });

  news.forEach((n) => {
    if (!n?.seoSlug) return;
    urls.push(
      createUrl(`${BASE_URL}/news/${n.seoSlug}`, formatDate(n.updatedAt), "0.8"),
    );
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("")}
</urlset>`;
}
