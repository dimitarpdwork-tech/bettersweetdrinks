CREATE TABLE IF NOT EXISTS ratings (
  slug TEXT NOT NULL,
  voter_hash TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (slug, voter_hash)
);

CREATE INDEX IF NOT EXISTS idx_ratings_slug ON ratings(slug);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  voter_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_comments_slug_status_created
ON comments(slug, status, created_at DESC);
