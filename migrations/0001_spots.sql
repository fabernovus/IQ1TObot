CREATE TABLE spots (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  callsign TEXT NOT NULL,
  band TEXT NOT NULL,
  frequency_hz INTEGER NOT NULL,
  mode TEXT NOT NULL,
  locator TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  ended_at INTEGER,
  message_id INTEGER,
  sync_state TEXT NOT NULL DEFAULT 'pending' CHECK(sync_state IN ('pending','sending','synced','failed')),
  sync_after INTEGER NOT NULL DEFAULT 0,
  sync_attempts INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX one_active_spot_per_user ON spots(user_id) WHERE ended_at IS NULL;
CREATE INDEX active_spots ON spots(created_at DESC) WHERE ended_at IS NULL;
CREATE INDEX user_spots ON spots(user_id, created_at DESC);
CREATE INDEX pending_sync ON spots(sync_state, sync_after);
CREATE INDEX spot_retention ON spots(ended_at) WHERE ended_at IS NOT NULL;
