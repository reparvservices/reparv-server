-- Customers (guestUsers) can like and comment on feed posts.
-- Extends the role enums with 'customer'. Safe to run more than once.
ALTER TABLE feed_post_likes
  MODIFY user_role ENUM('sales_partner','territory_partner','project_partner','customer') NOT NULL;
ALTER TABLE feed_post_comments
  MODIFY author_role ENUM('sales_partner','territory_partner','project_partner','customer') NOT NULL;

-- Partners are notified when a customer likes or comments on their post.
ALTER TABLE feed_notifications
  MODIFY actor_role ENUM('sales_partner','territory_partner','project_partner','customer') NOT NULL;
