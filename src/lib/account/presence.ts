import { database, type Account } from "./database";
export function presenceTable() {
  const db = database();
  db.exec("CREATE TABLE IF NOT EXISTS user_presence (user_id TEXT PRIMARY KEY, version INTEGER NOT NULL, last_seen INTEGER NOT NULL)");
  return db;
}
export function markPresent(user: Account) {
  const db = presenceTable(), now = Date.now();
  db.prepare("DELETE FROM user_presence WHERE last_seen < ?").run(now - 90_000);
  db.prepare("INSERT INTO user_presence VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET version = excluded.version, last_seen = excluded.last_seen").run(user.id, user.session_version, now);
}
export function activeUsers() {
  return (presenceTable().prepare("SELECT COUNT(*) AS total FROM user_presence p JOIN users u ON u.id = p.user_id WHERE p.last_seen >= ? AND p.version = u.session_version AND u.disabled = 0").get(Date.now() - 90_000) as { total: number }).total;
}
