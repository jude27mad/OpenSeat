CREATE TABLE IF NOT EXISTS seat_observation (
  room text NOT NULL,
  source text NOT NULL CHECK (source IN ('qr','report','sensor','ble')),
  target text NOT NULL,
  reading text NOT NULL,
  observed_at timestamptz NOT NULL,
  event_id uuid NOT NULL,
  simulated boolean NOT NULL DEFAULT false,
  owner_hash text,
  PRIMARY KEY (room, source, target)
);
CREATE INDEX IF NOT EXISTS seat_observation_age ON seat_observation (observed_at);
