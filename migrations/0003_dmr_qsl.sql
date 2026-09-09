DROP INDEX one_active_spot_per_user;
CREATE INDEX active_user_spots ON spots(user_id) WHERE ended_at IS NULL;
CREATE TRIGGER max_three_active_spots BEFORE INSERT ON spots
WHEN NEW.ended_at IS NULL AND (SELECT COUNT(*) FROM spots WHERE user_id=NEW.user_id AND ended_at IS NULL)>=3
BEGIN SELECT RAISE(ABORT,'max_active_spots'); END;
CREATE TRIGGER max_three_active_spots_update BEFORE UPDATE OF ended_at,user_id ON spots
WHEN NEW.ended_at IS NULL AND (SELECT COUNT(*) FROM spots WHERE user_id=NEW.user_id AND ended_at IS NULL AND id!=NEW.id)>=3
BEGIN SELECT RAISE(ABORT,'max_active_spots'); END;
ALTER TABLE spots ADD COLUMN dmr_type TEXT NOT NULL DEFAULT '';
ALTER TABLE spots ADD COLUMN talkgroup INTEGER;
ALTER TABLE spots ADD COLUMN notes TEXT NOT NULL DEFAULT '';
ALTER TABLE spots ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE spots ADD COLUMN qsl_count INTEGER NOT NULL DEFAULT 0;
UPDATE spots SET dmr_type='direct' WHERE mode='DMR';
CREATE TABLE qsl_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spot_id TEXT NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  callsign TEXT NOT NULL,
  locator TEXT NOT NULL,
  report TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  recorded_at INTEGER NOT NULL,
  distance_km REAL NOT NULL,
  UNIQUE(spot_id,user_id)
);
CREATE INDEX qsl_by_spot ON qsl_logs(spot_id,id DESC);
CREATE TRIGGER qsl_sync AFTER INSERT ON qsl_logs BEGIN
  UPDATE spots SET qsl_count=qsl_count+1,revision=revision+1,
    sync_state=CASE WHEN sync_state='sending' THEN 'sending' ELSE 'pending' END,
    sync_after=0,sync_attempts=0 WHERE id=NEW.spot_id;
END;
