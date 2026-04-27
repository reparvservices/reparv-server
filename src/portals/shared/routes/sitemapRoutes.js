import express from "express";
import generateSitemap from "#utils/generateSitemap.js";
import {
  getBlogs,
  getNews,
  getProperties,
} from "../services/sitemapService.js";

const router = express.Router();

router.get("/sitemap.xml", async (req, res) => {
  try {
    const properties = await getProperties();
    const blogs = await getBlogs();
    const news = await getNews();
    const sitemap = generateSitemap({ properties, blogs, news });

    res.header("Content-Type", "application/xml");
    res.send(sitemap);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error generating sitemap");
  }
});

export default router;
