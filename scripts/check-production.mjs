import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());
const env = process.env;
let failed = false;
function check(label, valid) {
  console.log(`${valid ? "OK" : "ERREUR"} ${label}`);
  if (!valid) failed = true;
}
check("ACCOUNT_PROVIDER=supabase", env.ACCOUNT_PROVIDER === "supabase");
const publicKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
check("Cle publique presente", Boolean(publicKey));
check("Cle serveur presente et distincte", Boolean(secret && secret !== publicKey));
for (const key of ["APP_URL", "NEXT_PUBLIC_SUPABASE_URL"]) {
  let valid = false;
  try {
    const url = new URL(env[key]);
    valid = url.protocol === "https:" && !url.username && !url.password &&
      !url.search && !url.hash && url.pathname === "/" &&
      !["localhost", "127.0.0.1"].includes(url.hostname);
  } catch { /* Missing or invalid URL. */ }
  check(`${key} : origine HTTPS publique`, valid);
}
if (env.PAYPAL_CLIENT_ID || env.PAYPAL_CLIENT_SECRET) {
  for (const key of ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID"]) {
    check(`${key} present`, Boolean(env[key]));
  }
  check("PAYPAL_ENV explicite (sandbox ou live)", ["sandbox", "live"].includes(env.PAYPAL_ENV));
  console.log("A VERIFIER : webhook PayPal sur le domaine public stable et dans le meme mode.");
}
if (!failed) {
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(15000) }) },
  });
  try {
    const users = await client.auth.admin.listUsers({ page: 1, perPage: 1 });
    check("Acces administrateur Supabase Auth", !users.error && Array.isArray(users.data?.users));
    for (const table of ["profiles", "pro_access", "paypal_orders", "user_presence", "usage_samples"]) {
      const result = await client.from(table).select("*", { head: true, count: "exact" });
      check(`Table ${table}`, !result.error && result.status === 200);
    }
    const admin = await client.from("profiles").select("id").eq("role", "admin").eq("disabled", false).limit(1);
    check("Administrateur actif", !admin.error && admin.data?.length === 1);
  } catch {
    check("Connexion Supabase (reseau ou configuration)", false);
  }
}
console.log("A VERIFIER : SMTP, modeles email, Site URL Supabase et absence de protection SSO sur les webhooks.");
console.log("Live/Zoom et yt-dlp necessitent un serveur persistant distinct de Vercel.");
process.exitCode = failed ? 1 : 0;
