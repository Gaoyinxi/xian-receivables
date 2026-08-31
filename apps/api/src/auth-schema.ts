import { getRawDb } from '../../../db/adapters/node';

export async function initializeAuthSchema() {
  const db = getRawDb();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS auth_users (
      id TEXT PRIMARY KEY NOT NULL, username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('CITY_ADMIN','DISTRICT_ADMIN','DISTRICT_OPERATOR')),
      district_id TEXT REFERENCES districts(id), enabled INTEGER NOT NULL DEFAULT 1,
      must_change_password INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      CHECK((role = 'CITY_ADMIN' AND district_id IS NULL) OR (role != 'CITY_ADMIN' AND district_id IS NOT NULL))
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES auth_users(id),
      csrf_token TEXT NOT NULL, created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
    )`),
    db.prepare(
      'CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id)',
    ),
    db.prepare(`CREATE TABLE IF NOT EXISTS auth_login_limits (
      key TEXT PRIMARY KEY NOT NULL, attempts INTEGER NOT NULL, resets_at INTEGER NOT NULL
    )`),
    db
      .prepare(
        "INSERT OR IGNORE INTO app_meta (key, value) VALUES ('selfhost_schema_v1', ?)",
      )
      .bind(new Date().toISOString()),
  ]);
}
