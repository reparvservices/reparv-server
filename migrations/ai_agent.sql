-- Real Estate AI Agent tables (MySQL)
-- Run: mysql -u USER -p DB_NAME < migrations/ai_agent.sql

CREATE TABLE IF NOT EXISTS ai_conversations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id VARCHAR(64) NOT NULL,
  channel ENUM('web', 'whatsapp') NOT NULL DEFAULT 'web',
  chat_history JSON NOT NULL,
  preferences JSON NULL,
  enquirersid INT NULL,
  phone_e164 VARCHAR(20) NULL,
  language VARCHAR(8) NOT NULL DEFAULT 'en',
  updated_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_conv_user_channel (user_id, channel),
  KEY idx_ai_conv_phone (phone_e164)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_lead_profiles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id VARCHAR(64) NOT NULL,
  enquirersid INT NULL,
  name VARCHAR(255) NULL,
  phone VARCHAR(20) NULL,
  city VARCHAR(100) NULL,
  budget_min DECIMAL(15, 2) NULL,
  budget_max DECIMAL(15, 2) NULL,
  property_type VARCHAR(100) NULL,
  location_preference VARCHAR(255) NULL,
  home_loan_required TINYINT(1) NULL,
  purchase_timeline VARCHAR(50) NULL,
  lead_score ENUM('hot', 'warm', 'cold') NULL,
  lead_status VARCHAR(50) NOT NULL DEFAULT 'qualifying',
  assigned_to VARCHAR(255) NULL,
  metadata JSON NULL,
  updated_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_lead_user (user_id),
  KEY idx_ai_lead_score (lead_score),
  KEY idx_ai_lead_enquirer (enquirersid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_knowledge_documents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  propertyid INT NULL,
  title VARCHAR(255) NOT NULL,
  doc_type ENUM('pdf', 'faq', 'brochure', 'price_sheet', 'legal', 'other') NOT NULL DEFAULT 'other',
  source_path VARCHAR(512) NULL,
  status ENUM('pending', 'indexed', 'failed') NOT NULL DEFAULT 'pending',
  error_message TEXT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_ai_doc_property (propertyid),
  KEY idx_ai_doc_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_knowledge_chunks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  document_id BIGINT UNSIGNED NOT NULL,
  propertyid INT NULL,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  embedding JSON NOT NULL,
  token_count INT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_ai_chunk_doc (document_id),
  KEY idx_ai_chunk_property (propertyid),
  CONSTRAINT fk_ai_chunk_document
    FOREIGN KEY (document_id) REFERENCES ai_knowledge_documents (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
