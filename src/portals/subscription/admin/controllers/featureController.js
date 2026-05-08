import dbPromise from "#db/promise";

const normalizeDescription = (description) => {
  if (description == null) return null;
  const s = String(description).trim();
  return s === "" ? null : s;
};

const insertFeatureRow = async (name, status, description) => {
  const desc = normalizeDescription(description);
  try {
    const [result] = await dbPromise.query(
      "INSERT INTO subscription_feature (name, description, status) VALUES (?, ?, ?)",
      [name.trim(), desc, status],
    );
    return result;
  } catch (e) {
    if (e?.code === "ER_BAD_FIELD_ERROR") {
      const [result] = await dbPromise.query(
        "INSERT INTO subscription_feature (name, status) VALUES (?, ?)",
        [name.trim(), status],
      );
      return result;
    }
    throw e;
  }
};

const updateFeatureRow = async (id, name, status, description) => {
  const desc = normalizeDescription(description);
  try {
    await dbPromise.query(
      "UPDATE subscription_feature SET name = ?, description = ?, status = ? WHERE id = ?",
      [name.trim(), desc, status, id],
    );
  } catch (e) {
    if (e?.code === "ER_BAD_FIELD_ERROR") {
      await dbPromise.query("UPDATE subscription_feature SET name = ?, status = ? WHERE id = ?", [
        name.trim(),
        status,
        id,
      ]);
    } else {
      throw e;
    }
  }
};

export const getAllFeatures = async (req, res) => {
  try {
    const [rows] = await dbPromise.query("SELECT * FROM subscription_feature ORDER BY id DESC");
    return res.status(200).json(rows);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch features", error });
  }
};

export const getFeatureById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid id" });

    const [rows] = await dbPromise.query("SELECT * FROM subscription_feature WHERE id = ?", [id]);
    if (!rows.length) return res.status(404).json({ message: "Feature not found" });

    return res.status(200).json(rows[0]);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch feature", error });
  }
};

export const createFeature = async (req, res) => {
  try {
    const { name, status = "Active", description } = req.body;
    if (!name) return res.status(400).json({ message: "name is required" });

    const [duplicates] = await dbPromise.query(
      "SELECT id FROM subscription_feature WHERE LOWER(name) = LOWER(?)",
      [name.trim()],
    );
    if (duplicates.length) {
      return res.status(409).json({ message: "Feature already exists" });
    }

    const result = await insertFeatureRow(name, status, description);
    return res
      .status(201)
      .json({ message: "Feature created successfully", id: result.insertId });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create feature", error });
  }
};

export const updateFeature = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, status = "Active", description } = req.body;

    if (!id) return res.status(400).json({ message: "Invalid id" });
    if (!name) return res.status(400).json({ message: "name is required" });

    const [rows] = await dbPromise.query("SELECT id FROM subscription_feature WHERE id = ?", [id]);
    if (!rows.length) return res.status(404).json({ message: "Feature not found" });

    const [duplicates] = await dbPromise.query(
      "SELECT id FROM subscription_feature WHERE LOWER(name) = LOWER(?) AND id != ?",
      [name.trim(), id],
    );
    if (duplicates.length) {
      return res.status(409).json({ message: "Feature already exists" });
    }

    await updateFeatureRow(id, name, status, description);
    return res.status(200).json({ message: "Feature updated successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update feature", error });
  }
};

export const deleteFeature = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid id" });

    const [rows] = await dbPromise.query("SELECT id FROM subscription_feature WHERE id = ?", [id]);
    if (!rows.length) return res.status(404).json({ message: "Feature not found" });

    await dbPromise.query("DELETE FROM plan_feature_mapping WHERE feature_id = ?", [id]);
    await dbPromise.query("DELETE FROM subscription_feature WHERE id = ?", [id]);

    return res.status(200).json({ message: "Feature deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete feature", error });
  }
};
