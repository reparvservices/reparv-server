-- Website customers can list venues. Appends 'customer' to the owner roles; existing rows are unchanged.
ALTER TABLE venue_listings
  MODIFY owner_role ENUM('project','sales','territory','customer') NOT NULL DEFAULT 'project';
