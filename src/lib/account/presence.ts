import "server-only";
import { query } from "@/lib/neon/database";
import type { Account } from "./database";

const WINDOW_MS = 90_000;

export async function markPresent(user: Account) {
  const now = Date.now();
  await query("DELETE FROM edifycut.user_presence WHERE last_seen < $1", [now - WINDOW_MS]);
  await query(`INSERT INTO edifycut.user_presence(user_id, version, last_seen) VALUES ($1, $2, $3)
    ON CONFLICT (user_id) DO UPDATE SET version = excluded.version, last_seen = excluded.last_seen`, [user.id, user.session_version, now]);
}

export async function activeUsers() {
  const [row] = await query<{ total: number }>("SELECT edifycut.count_active_accounts($1) AS total", [Date.now() - WINDOW_MS]);
  return Number(row?.total || 0);
}
