
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  device TEXT
);
CREATE TABLE IF NOT EXISTS xtream_links (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  host TEXT NOT NULL,
  port INTEGER,
  username_enc TEXT NOT NULL,
  password_enc TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS watchlist (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  content_id TEXT NOT NULL,
  content_type TEXT NOT NULL,
  PRIMARY KEY (user_id, content_id, content_type)
);
CREATE TABLE IF NOT EXISTS progress (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  content_id TEXT NOT NULL,
  position_seconds INTEGER DEFAULT 0,
  duration_seconds INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT now(),
  PRIMARY KEY (user_id, content_id)
);
