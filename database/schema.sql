CREATE DATABASE IF NOT EXISTS xrqnafrj_dating_invitation
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE xrqnafrj_dating_invitation;

CREATE TABLE IF NOT EXISTS date_responses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  visitor_id VARCHAR(100) NOT NULL UNIQUE,
  yes_response BOOLEAN NOT NULL DEFAULT FALSE,
  selected_date DATE NULL,
  selected_time VARCHAR(20) NULL,
  selected_food VARCHAR(50) NULL,
  country VARCHAR(80) NULL,
  state VARCHAR(80) NULL,
  district VARCHAR(80) NULL,
  town VARCHAR(80) NULL,
  approximate_latitude DECIMAL(10, 7) NULL,
  approximate_longitude DECIMAL(10, 7) NULL,
  search_radius_km TINYINT UNSIGNED NOT NULL DEFAULT 10,
  final_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_location_acceptance (final_accepted, approximate_latitude, approximate_longitude),
  INDEX idx_place (country, state, district, town)
);

CREATE TABLE IF NOT EXISTS chat_rooms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  room_token VARCHAR(80) NOT NULL UNIQUE,
  visitor_one VARCHAR(100) NOT NULL,
  visitor_two VARCHAR(100) NULL,
  chat_mode ENUM('text', 'video') NOT NULL DEFAULT 'text',
  status ENUM('waiting', 'active', 'ended') NOT NULL DEFAULT 'waiting',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_chat_status (status, chat_mode, updated_at),
  INDEX idx_chat_visitor_one (visitor_one),
  INDEX idx_chat_visitor_two (visitor_two)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  room_token VARCHAR(80) NOT NULL,
  sender_id VARCHAR(100) NOT NULL,
  message_text VARCHAR(1000) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_messages_room (room_token, id),
  CONSTRAINT fk_messages_room
    FOREIGN KEY (room_token) REFERENCES chat_rooms(room_token)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_signals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  room_token VARCHAR(80) NOT NULL,
  sender_id VARCHAR(100) NOT NULL,
  signal_type ENUM('offer', 'answer', 'ice') NOT NULL,
  signal_payload JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_signals_room (room_token, id),
  CONSTRAINT fk_signals_room
    FOREIGN KEY (room_token) REFERENCES chat_rooms(room_token)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS online_users (
  visitor_id VARCHAR(100) PRIMARY KEY,
  country VARCHAR(80) NULL,
  state VARCHAR(80) NULL,
  district VARCHAR(80) NULL,
  town VARCHAR(80) NULL,
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_online_last_seen (last_seen),
  INDEX idx_online_country_state (country, state)
);

CREATE TABLE IF NOT EXISTS age_consents (
  visitor_id VARCHAR(100) PRIMARY KEY,
  accepted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_age_consents_accepted_at (accepted_at)
);

CREATE TABLE IF NOT EXISTS user_reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  room_token VARCHAR(80) NOT NULL,
  reporter_id VARCHAR(100) NOT NULL,
  reported_id VARCHAR(100) NOT NULL,
  reason VARCHAR(60) NOT NULL,
  detail VARCHAR(600) NULL,
  status ENUM('new', 'reviewing', 'actioned', 'dismissed') NOT NULL DEFAULT 'new',
  moderator_action VARCHAR(255) NULL,
  actioned_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_reports_status_created (status, created_at),
  INDEX idx_reports_reported (reported_id, created_at)
);

CREATE TABLE IF NOT EXISTS chat_blocks (
  blocker_id VARCHAR(100) NOT NULL,
  blocked_id VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (blocker_id, blocked_id),
  INDEX idx_blocks_blocked (blocked_id)
);

ALTER TABLE chat_rooms
  ADD COLUMN IF NOT EXISTS chat_mode ENUM('text', 'video') NOT NULL DEFAULT 'text' AFTER visitor_two;
