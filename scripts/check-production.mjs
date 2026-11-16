import nextEnv from "@next/env";
import pg from "pg";

nextEnv.loadEnvConfig(process.cwd());
const env = process.env;
let failed = false;
function check(label, valid) {
  console.log(`${valid ? "OK" : "ERREUR"} ${label}`);
  if (!valid) failed = true;
}
function publicHttps(value, allowPath = false) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash &&
      (allowPath || url.pathname === "/") && !["localhost", "127.0.0.1"].includes(url.hostname);
  } catch { return false; }
}
check("DATABASE_URL present", Boolean(env.DATABASE_URL));
check("NEON_AUTH_BASE_URL : HTTPS public", publicHttps(env.NEON_AUTH_BASE_URL, true));
check("NEON_AUTH_COOKIE_SECRET (32 caracteres min.)", (env.NEON_AUTH_COOKIE_SECRET || "").length >= 32);
check("APP_URL : origine HTTPS publique", publicHttps(env.APP_URL));
const storage = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_ENDPOINT_URL_S3", "AWS_REGION"].filter(key => env[key]);
console.log(storage.length === 4 ? "OK Stockage Neon configure" : "INFO Stockage Neon absent : les captures restent sur le disque");
if (env.PAYPAL_CLIENT_ID || env.PAYPAL_CLIENT_SECRET) {
  for (const key of ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID"]) check(`${key} present`, Boolean(env[key]));
  check("PAYPAL_ENV explicite (sandbox ou live)", ["sandbox", "live"].includes(env.PAYPAL_ENV));
  console.log("A VERIFIER : webhook PayPal sur le domaine public stable et dans le meme mode.");
}
if (env.DATABASE_URL) {
  const client = new pg.Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 15000 });
  try {
    await client.connect();
    for (const table of ["profiles", "pro_access", "paypal_orders", "user_presence", "usage_samples"]) {
      const { rows } = await client.query("SELECT to_regclass($1) AS name", [`edifycut.${table}`]);
      check(`Table edifycut.${table}`, Boolean(rows[0].name));
    }
    const admin = await client.query("SELECT 1 FROM edifycut.profiles WHERE role = 'admin' AND NOT disabled LIMIT 1").catch(() => ({ rowCount: 0 }));
    check("Administrateur actif", admin.rowCount === 1);
  } catch {
    check("Connexion Neon (reseau ou configuration)", false);
  } finally { await client.end().catch(() => {}); }
}
console.log("A VERIFIER : domaines de confiance et e-mails Neon Auth, absence de protection SSO sur les webhooks.");
console.log("Live/Zoom et yt-dlp necessitent un serveur persistant distinct de Vercel.");
process.exitCode = failed ? 1 : 0;
