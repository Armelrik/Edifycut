import Database from "better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const state = globalThis as typeof globalThis & { edifycutDatabase?: Database.Database };

export function database() {
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
};

export function publicAccount(user: Account) {
  return { id: user.id, email: user.email, name: user.name, role: user.role, disabled: Boolean(user.disabled), createdAt: user.created_at };
}
