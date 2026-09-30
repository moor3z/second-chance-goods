-- Second Chance Goods catalogue schema (Cloudflare D1 / SQLite)
-- Items are stored per snapshot. The site only reads the snapshot named in
-- sync_state.current_snapshot, so a new sync becomes visible in one atomic switch.

CREATE TABLE IF NOT EXISTS items (
  snapshot_id        TEXT    NOT NULL,
  item_id            TEXT    NOT NULL,
  title              TEXT    NOT NULL,
  listing_type       TEXT    NOT NULL CHECK (listing_type IN ('fixed', 'auction')),
  price_pence        INTEGER NOT NULL,
  currency           TEXT    NOT NULL,
  buy_it_now_pence   INTEGER,
  bid_count          INTEGER,
  best_offer         INTEGER NOT NULL DEFAULT 0,
  condition_name     TEXT,
  ebay_category_id   TEXT,
  ebay_category_path TEXT,
  site_category      TEXT    NOT NULL,
  image_urls         TEXT    NOT NULL DEFAULT '[]',
  listing_url        TEXT    NOT NULL,
  quantity_available INTEGER,
  start_time         TEXT,
  end_time           TEXT,
  PRIMARY KEY (snapshot_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_items_snapshot_start ON items (snapshot_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_items_snapshot_category ON items (snapshot_id, site_category, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_items_snapshot_price ON items (snapshot_id, price_pence);

-- Key/value state: current_snapshot, previous_snapshot, last_success_at, item_count, source, seller_feedback_percent
CREATE TABLE IF NOT EXISTS sync_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Single-row lock so two syncs can never overlap.
CREATE TABLE IF NOT EXISTS sync_lock (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  owner      TEXT,
  expires_at INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO sync_lock (id, owner, expires_at) VALUES (1, NULL, 0);

-- Audit trail of sync attempts (trimmed by the Worker).
CREATE TABLE IF NOT EXISTS sync_runs (
  id          TEXT PRIMARY KEY,
  trigger     TEXT NOT NULL,
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  status      TEXT NOT NULL,
  item_count  INTEGER,
  pages       INTEGER,
  message     TEXT
);
CREATE INDEX IF NOT EXISTS idx_sync_runs_started ON sync_runs (started_at DESC);
