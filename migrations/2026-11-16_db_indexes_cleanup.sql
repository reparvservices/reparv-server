-- 2026-11-16: missing lookup indexes, redundant index cleanup, stale OTP cleanup.
-- ALREADY APPLIED TO PRODUCTION on 2026-11-16 (backup: prod-pre-indexes-20261116-2204.sql).
-- Not re-runnable: MySQL has no CREATE INDEX IF NOT EXISTS, so a second run errors on the
-- existing indexes. Apply to any other environment (e.g. staging/local) exactly once.

-- 1. Missing indexes (these columns are used in JOIN / WHERE on hot paths)
ALTER TABLE propertiesinfo ADD INDEX idx_propertiesinfo_propertyid (propertyid);
ALTER TABLE enquirers      ADD INDEX idx_enquirers_propertyid (propertyid);
ALTER TABLE enquirers      ADD INDEX idx_enquirers_projectpartnerid (projectpartnerid);
ALTER TABLE enquirers      ADD INDEX idx_enquirers_salespersonid (salespersonid);
ALTER TABLE salespersons   ADD INDEX idx_salespersons_projectpartnerid (projectpartnerid);
ALTER TABLE guestUsers     ADD INDEX idx_guestusers_contact (contact);
ALTER TABLE guestUsers     ADD INDEX idx_guestusers_email (email);

-- 2. Redundant indexes (duplicates of an existing index / the primary key)
ALTER TABLE eventUsers      DROP INDEX mobileNumber_2, DROP INDEX mobileNumber_3, DROP INDEX mobileNumber_4;
ALTER TABLE booked_tickets  DROP INDEX idx_bt_ref;
ALTER TABLE schedule_notes  DROP INDEX id;
ALTER TABLE feed_follows    DROP INDEX idx_follower;
ALTER TABLE feed_post_likes DROP INDEX idx_post;
ALTER TABLE feed_saved_posts DROP INDEX idx_user;
ALTER TABLE feed_story_views DROP INDEX idx_story;

-- 3. Clear expired / undated OTP codes (42 rows when applied)
UPDATE guestUsers SET otp = NULL, otp_expires_at = NULL
WHERE otp IS NOT NULL AND (otp_expires_at IS NULL OR otp_expires_at < NOW());
