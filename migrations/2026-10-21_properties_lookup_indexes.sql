-- Lookup indexes for the properties table (it only had the primary key).
-- Covers the queries every public page and the website listing flow run:
--   property page by URL, city listings, public filter, "My Listings",
--   and the duplicate-name check before adding a property.
-- seoSlug / propertyName are TEXT/VARCHAR, so seoSlug uses a prefix (longest slug today: 64 chars).
-- Online DDL: no data changes, no table lock needed on InnoDB.
ALTER TABLE properties
  ADD INDEX idx_properties_seoSlug (seoSlug(150)),
  ADD INDEX idx_properties_city (city),
  ADD INDEX idx_properties_status_approve (status, approve),
  ADD INDEX idx_properties_guestUserId (guestUserId),
  ADD INDEX idx_properties_propertyName (propertyName);
