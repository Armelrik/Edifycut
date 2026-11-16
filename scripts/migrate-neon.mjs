import nextEnv from "@next/env";
import pg from "pg";
import { readFile } from "node:fs/promises";
nextEnv.loadEnvConfig(process.cwd());
const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED });
if (!process.env.DATABASE_URL_UNPOOLED) throw new Error("DATABASE_URL_UNPOOLED is required");
try {
  await client.connect();
  await client.query("BEGIN");
  await client.query(await readFile(new URL("../neon/migrations/001_accounts.sql", import.meta.url), "utf8"));
  await client.query("COMMIT");
  console.log("PASS: Neon account schema migrated");
} finally { await client.end(); }
