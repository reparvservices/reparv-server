import express from "express";
import fetch from "node-fetch";

const router = express.Router();

router.get("/geocode", async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: "Missing query" });

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Reparv/1.0 (contact@reparv.in)", // required by Nominatim
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: "Geocode fetch failed" });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Geocode error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/reverse", async (req, res) => {
  try {
    const { lat, lon } = req.query;
    if (!lat || !lon) {
      return res.status(400).json({ error: "Missing lat/lon" });
    }

    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "YourAppName/1.0 (your@email.com)",
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: "Reverse fetch failed" });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Reverse geocode error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// fetch City From Current Location

export default router;