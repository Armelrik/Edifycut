// Donne le rôle administrateur à un compte déjà créé depuis /account.
import nextEnv from "@next/env";
import pg from "pg";

nextEnv.loadEnvConfig(process.cwd());
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
if (!email) throw new Error("Définissez ADMIN_EMAIL avec l'adresse d'un compte existant.");
const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL est requis.");
const client = new pg.Client({ connectionString });
await client.connect();
try {
  const { rowCount } = await client.query("UPDATE edifycut.profiles SET role = 'admin', disabled = false, session_version = session_version + 1 WHERE lower(email) = $1", [email]);
  if (!rowCount) {
    console.error(`Aucun profil pour ${email}. Créez le compte depuis /account et connectez-vous une fois, puis relancez.`);
    process.exitCode = 1;
  } else console.log(`OK : ${email} est administrateur.`);
} finally { await client.end(); }
