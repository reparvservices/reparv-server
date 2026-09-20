// properties.propertyType is meant to hold a JSON array (e.g. ["2 BHK"]),
// but many legacy rows store a plain string (e.g. "NewFlat") instead.
// Handle both so we never silently drop the value to [].
export function parsePropertyType(value) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (e) {
    return [value];
  }
}
