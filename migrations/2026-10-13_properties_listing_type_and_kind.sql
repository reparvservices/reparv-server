-- Partner listing flow: Sell / Buy / Rent + Residential / Commercial / Agriculture
-- Both columns are nullable; NULL on older rows is derived from propertyCategory
-- by src/core/utils/propertyListing.js.
ALTER TABLE properties
  ADD COLUMN listingType VARCHAR(10) NULL DEFAULT NULL AFTER propertyCategory,
  ADD COLUMN propertyKind VARCHAR(20) NULL DEFAULT NULL AFTER listingType;
