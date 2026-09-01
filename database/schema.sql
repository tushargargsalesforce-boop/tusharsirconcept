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
  status ENUM('waiting', 'active', 'ended') NOT NULL DEFAULT 'waiting',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_chat_status (status, updated_at),
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
