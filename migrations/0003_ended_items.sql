-- Your own listing history (ended listings, sold or not), kept for sold statistics in the Price Scanner.
CREATE TABLE IF NOT EXISTS ended_items (
  item_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT NOT NULL,
  sold INTEGER NOT NULL DEFAULT 0,     -- 1 if at least one sold
  quantity_sold INTEGER NOT NULL DEFAULT 0,
  price_pence INTEGER,                 -- final/sold price (or last asking price if unsold)
  currency TEXT,
  listing_type TEXT,
  site_category TEXT
);
CREATE INDEX IF NOT EXISTS idx_ended_end_time ON ended_items (end_time DESC);
