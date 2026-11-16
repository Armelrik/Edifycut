import "server-only";
import { Pool, types, type QueryResultRow } from "pg";
import { attachDatabasePool } from "@vercel/functions";

// Preserve the account API's ISO timestamps and numeric metric fields.
types.setTypeParser(1184, value => new Date(value).toISOString());
types.setTypeParser(20, Number);
const state = globalThis as typeof globalThis & { edifycutPool?: Pool };
export function pool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL est requis.");
  if (!state.edifycutPool) {
    state.edifycutPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 10000, idleTimeoutMillis: 5000 });
    attachDatabasePool(state.edifycutPool);
  }
  return state.edifycutPool;
}
export async function query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
  return (await pool().query<T>(text, values)).rows;
}
