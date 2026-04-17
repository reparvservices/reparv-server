// Convert "" or "null" to actual null
export const sanitize = (val) => {
  if (val === "" || val === "null" || typeof val === "undefined") return null;
  return val;
};