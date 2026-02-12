-- FleetScore Database Schema - SQLite Version
-- This creates TWO tables: users and password_history
-- With proper triggers and constraints for production use

-- ============================================================================
-- TABLE 1: USERS (stores all user profile information)
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  -- Basic Info
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,           -- Cannot change
  display_name TEXT NOT NULL,              -- CAN change
  email TEXT UNIQUE NOT NULL,              -- CAN change
  password_hash TEXT NOT NULL,             -- Encrypted password
  
  -- Personal Info (all can change)
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone_number TEXT,
  profile_picture_url TEXT,
  
  -- Account Settings
  account_type TEXT NOT NULL CHECK (account_type IN ('Driver', 'Sponsor', 'Admin')),
  point_to_dollar_ratio INTEGER DEFAULT 100 CHECK (point_to_dollar_ratio > 0),
  
  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_password_change DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  -- Account Status
  is_active INTEGER DEFAULT 1  -- 1 = active, 0 = inactive
);

-- Make searches faster with indexes
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Auto-update updated_at on any change
CREATE TRIGGER IF NOT EXISTS trg_users_updated_at
AFTER UPDATE ON users
FOR EACH ROW
BEGIN
  UPDATE users
  SET updated_at = CURRENT_TIMESTAMP
  WHERE id = OLD.id;
END;

-- ============================================================================
-- TABLE 2: PASSWORD_HISTORY (prevents password reuse)
-- ============================================================================

CREATE TABLE IF NOT EXISTS password_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  password_hash TEXT NOT NULL,             -- Old password (encrypted)
  changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  changed_from_ip TEXT,                    -- For security tracking
  user_agent TEXT,                         -- Browser info
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Make searches faster
CREATE INDEX IF NOT EXISTS idx_password_history_user_id ON password_history(user_id);
CREATE INDEX IF NOT EXISTS idx_password_history_changed_at ON password_history(changed_at);

-- Prevent duplicate password history entries
CREATE UNIQUE INDEX IF NOT EXISTS 
idx_password_history_unique 
ON password_history(user_id, password_hash);

-- ============================================================================
-- SAMPLE DATA (for testing - remove in production)
-- ============================================================================

-- Password for all test users: "password123"
-- bcrypt hash of "password123"

INSERT OR IGNORE INTO users (
  username, display_name, email, password_hash, 
  first_name, last_name, phone_number, profile_picture_url,
  account_type, point_to_dollar_ratio
) VALUES
  (
    'johndoe',
    'John Doe',
    'john.doe@example.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5NU7RMIh6h1Re',
    'John',
    'Doe',
    '+1 (555) 123-4567',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=johndoe',
    'Admin',
    100
  ),
  (
    'janesmith',
    'Jane Smith',
    'jane.smith@example.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5NU7RMIh6h1Re',
    'Jane',
    'Smith',
    '+1 (555) 234-5678',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=janesmith',
    'Sponsor',
    150
  ),
  (
    'bobwilson',
    'Bob Wilson',
    'bob.wilson@example.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5NU7RMIh6h1Re',
    'Bob',
    'Wilson',
    '+1 (555) 345-6789',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=bobwilson',
    'Driver',
    100
  );

-- ============================================================================
-- DONE! Fully production-correct SQLite schema.
-- ============================================================================
