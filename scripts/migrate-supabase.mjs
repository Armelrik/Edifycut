import { createClient } from "@supabase/supabase-js";
import Database from "better-sqlite3";
import nextEnv from "@next/env";
import { existsSync } from "node:fs";
import { join } from "node:path";
nextEnv.loadEnvConfig(process.cwd());
const apply = process.argv.includes("--apply");
const path = join(process.cwd(), ".data", "edifycut.sqlite");
if (!existsSync(path)) throw new Error("Base SQLite locale introuvable.");
const db = new Database(path, { readonly: true });
const users = db.prepare("SELECT * FROM users ORDER BY created_at").all();
const hasTable = name => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
const grants = hasTable("pro_access") ? db.prepare("SELECT * FROM pro_access").all() : [];
const orders = hasTable("paypal_orders") ? db.prepare("SELECT * FROM paypal_orders").all() : [];
console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", users: users.length, proAccess: grants.length, paypalOrders: orders.length }));
if (!apply) { console.log("Aucune modification. Sauvegarder .data, appliquer la migration SQL puis relancer avec --apply."); db.close(); process.exit(0); }
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Configurer l’URL et la clé serveur Supabase dans .env.");
const cloud = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
function checked(error) { if (error) throw new Error("Migration interrompue : " + error.message); }
try {
  // Preflight ALL identities before changing remote accounts. Never merge by email silently.
  const remoteUsers = [];
  for (let page = 1; ; page++) {
    const { data, error } = await cloud.auth.admin.listUsers({ page, perPage: 1000 }); checked(error);
    remoteUsers.push(...data.users); if (data.users.length < 1000) break;
  }
  for (const user of users) {
    const sameId = remoteUsers.find(remote => remote.id === user.id);
    const sameEmail = remoteUsers.find(remote => remote.email?.toLowerCase() === user.email.toLowerCase());
    if (sameId && sameId.email?.toLowerCase() !== user.email.toLowerCase() || sameEmail && sameEmail.id !== user.id) throw new Error("Conflit d’identité détecté pour un compte. Aucun rapprochement automatique.");
    if (!/^\$2[aby]\$/.test(user.password_hash)) throw new Error("Hachage non bcrypt détecté. Migration manuelle requise.");
  }
  checked((await cloud.from("profiles").select("id").limit(1)).error);
  checked((await cloud.from("pro_access").select("user_id").limit(1)).error);
  checked((await cloud.from("paypal_orders").select("id").limit(1)).error);
  let done = 0;
  for (const user of users) {
    let remote = remoteUsers.find(remote => remote.id === user.id);
    if (!remote) {
      const { error, data } = await cloud.auth.admin.createUser({ id: user.id, email: user.email, password_hash: user.password_hash, email_confirm: user.role === "admin" || process.argv.includes("--confirm-existing-emails"), user_metadata: { name: user.name }, app_metadata: { edifycut_sqlite_import: "pending" }, ...(user.disabled ? { ban_duration: "876000h" } : {}) });
      checked(error);
      remote = data.user;
    }
    // Existing remote profiles/passwords are not overwritten on a resumed migration.
    const { data: profile, error } = await cloud.from("profiles").select("role,session_version").eq("id", user.id).single(); checked(error);
    if (!profile) throw new Error("Profil manquant : vérifier le trigger avant de reprendre.");
    // Only the explicitly requested migration imports the local administrative role.
    if (remote?.app_metadata?.edifycut_sqlite_import === "pending") {
      checked((await cloud.from("profiles").update({ name: user.name, email: user.email, role: user.role, disabled: Boolean(user.disabled), session_version: user.session_version, created_at: user.created_at }).eq("id", user.id)).error);
      checked((await cloud.auth.admin.updateUserById(user.id, { app_metadata: { ...remote.app_metadata, edifycut_sqlite_import: "complete" } })).error);
    }
    done++; console.log("Comptes traités : " + done + "/" + users.length);
  }
  for (const access of grants) {
    checked((await cloud.from("pro_access").upsert(access, { onConflict: "user_id", ignoreDuplicates: true })).error);
  }
  for (const order of orders) {
    checked((await cloud.from("paypal_orders").upsert({ ...order, mode: order.mode || "sandbox" }, { onConflict: "id", ignoreDuplicates: true })).error);
  }
  console.log("Migration terminée. SQLite reste intact. Vérifier les rôles et les accès avant de basculer ACCOUNT_PROVIDER.");
} finally { db.close(); }
