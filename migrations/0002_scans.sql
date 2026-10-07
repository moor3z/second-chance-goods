-- Price Scanner: photo scans and their AI-identified draft listings.
CREATE TABLE IF NOT EXISTS scans (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  photo_keys TEXT NOT NULL,          -- JSON array of R2 object keys
  result TEXT,                        -- JSON from the identifier (title, specifics, etc.)
  edited TEXT,                        -- JSON of the team's edits to the draft
  status TEXT NOT NULL DEFAULT 'identified',  -- identified | listed | discarded
  ebay_item_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_scans_created ON scans (created_at DESC);
