-- Venue listings: a free-text type name for "Other", uploaded videos, and social links.
-- Additive only. Apply once per environment (MySQL has no ADD COLUMN IF NOT EXISTS).
ALTER TABLE venue_listings
  ADD COLUMN custom_type VARCHAR(60) NULL AFTER type,
  ADD COLUMN videos JSON NULL AFTER images,
  ADD COLUMN social_links JSON NULL AFTER videos;
