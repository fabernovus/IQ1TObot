CREATE TABLE profiles (
  telegram_id INTEGER PRIMARY KEY,
  callsign TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL,
  default_locator TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0 CHECK(is_admin IN (0,1))
);
INSERT INTO profiles(telegram_id,callsign,name,default_locator,is_admin)
VALUES(22699108,'IU1WWY','Antonio','JN35UC',1);
ALTER TABLE spots ADD COLUMN activity TEXT NOT NULL DEFAULT '';
ALTER TABLE spots ADD COLUMN activity_name TEXT NOT NULL DEFAULT '';
ALTER TABLE spots ADD COLUMN topic_id INTEGER;
