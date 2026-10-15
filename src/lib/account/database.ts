import Database from "better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { usingSupabase } from "@/lib/supabase/config";
import { supabaseAdmin, assertDatabase } from "@/lib/supabase/admin";

const state = globalThis as typeof globalThis & { edifycutDatabase?: Database.Database };

export function database() {
  if (process.env.VERCEL && usingSupabase()) throw new Error("SQLite local est désactivé sur Vercel en mode Supabase.");
  if (!state.edifycutDatabase) {
    const directory = join(process.cwd(), ".data");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const db = new Database(join(directory, "edifycut.sqlite"));
    db.pragma("journal_mode = WAL");
    db.exec(readFileSync(join(process.cwd(), "src/lib/account/schema.sql"), "utf8"));
    state.edifycutDatabase = db;
  }
  return state.edifycutDatabase;
}

export type Account = {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  disabled: number;
  session_version: number;
  created_at: string;
  password_hash: string;
  pro_until?: string | null;
};

export async function publicAccount(user: Account) {
  return { id: user.id, email: user.email, name: user.name, role: user.role, disabled: Boolean(user.disabled), createdAt: user.created_at, proUntil: user.pro_until !== undefined ? user.pro_until : await proUntil(user.id) };
}

export function proDatabase() {
  const db = database();
  db.exec("CREATE TABLE IF NOT EXISTS pro_access (user_id TEXT PRIMARY KEY, expires_at TEXT NOT NULL, granted_by TEXT NOT NULL, updated_at TEXT NOT NULL)");
  return db;
}
export function localProUntil(id: string): string | null {
  const access = proDatabase().prepare("SELECT expires_at, granted_by FROM pro_access WHERE user_id = ?").get(id) as { expires_at: string; granted_by: string } | undefined;
  if (process.env.PAYPAL_ENV === "live" && access?.granted_by.startsWith("paypal:sandbox:")) return null;
  return access?.expires_at ?? null;
}
export async function proUntil(id: string): Promise<string | null> {
  if (!usingSupabase()) return localProUntil(id);
  const { data, error } = await supabaseAdmin().from("pro_access").select("expires_at,granted_by").eq("user_id", id).maybeSingle();
  assertDatabase(error);
  if (process.env.PAYPAL_ENV === "live" && data?.granted_by.startsWith("paypal:sandbox:")) return null;
  return data?.expires_at ?? null;
}
