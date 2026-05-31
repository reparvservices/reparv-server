-- Partner join leads from website "Join as Partner" popup

CREATE TABLE IF NOT EXISTS partner_join_leads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(128) NOT NULL,
  last_name VARCHAR(128) NOT NULL,
  contact VARCHAR(10) NOT NULL,
  join_token VARCHAR(64) NOT NULL,
  status ENUM('pending', 'verified', 'whatsapp_sent', 'registered') NOT NULL DEFAULT 'pending',
  source VARCHAR(64) NOT NULL DEFAULT 'website_join_modal',
  otp_verified_at DATETIME NULL,
  whatsapp_sent_at DATETIME NULL,
  registered_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_partner_join_leads_contact (contact),
  UNIQUE KEY uq_partner_join_leads_token (join_token),
  KEY idx_partner_join_leads_status (status)
);
