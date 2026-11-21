import dbPromise from "#db/promise";

/**
 * Website customers (guestUser) may only touch their own listings.
 * Each lookup resolves the owning customer (`properties.guestUserId`) from the id the route carries.
 */
const LOOKUPS = {
  property: "SELECT guestUserId AS ownerId FROM properties WHERE propertyid = ?",
  image:
    "SELECT p.guestUserId AS ownerId FROM propertiesimages i JOIN properties p ON p.propertyid = i.propertyid WHERE i.imageid = ?",
  info:
    "SELECT p.guestUserId AS ownerId FROM propertiesinfo i JOIN properties p ON p.propertyid = i.propertyid WHERE i.propertyinfoid = ?",
};

const defaultQuery = (sql, params) => dbPromise.query(sql, params);

/**
 * @param kind  "property" | "image" | "info": what the id in the request refers to
 * @param getId (req) => raw id (from params or body)
 * @param query injectable for tests: (sql, params) => Promise<[rows]>
 */
export function requireListingOwner(kind, getId, query = defaultQuery) {
  const sql = LOOKUPS[kind];
  if (!sql) throw new Error(`Unknown listing lookup: ${kind}`);

  return async function listingOwnerGuard(req, res, next) {
    try {
      const userId = req.guestUser?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized. Please log in." });
      }

      const id = Number(getId(req));
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ message: "Invalid ID" });
      }

      const [rows] = await query(sql, [id]);
      if (!rows?.length) {
        return res.status(404).json({ message: "Not found" });
      }
      if (String(rows[0].ownerId) !== String(userId)) {
        return res.status(403).json({ message: "You can only change your own listings." });
      }
      return next();
    } catch (err) {
      console.error("requireListingOwner:", err);
      return res.status(500).json({ message: "Listing access check failed" });
    }
  };
}

export const ownsPropertyParam = requireListingOwner("property", (req) => req.params.id);
export const ownsPropertyBody = requireListingOwner("property", (req) => req.body?.propertyid);
export const ownsImageParam = requireListingOwner("image", (req) => req.params.id);
export const ownsInfoParam = requireListingOwner("info", (req) => req.params.id);
