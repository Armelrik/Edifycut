import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { hash } from "bcryptjs";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
if (!process.env.SESSION_SECRET) {
  const envPath = join(process.cwd(), ".env");
  const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  writeFileSync(envPath, `${existing.trimEnd()}\nSESSION_SECRET=${randomBytes(48).toString("hex")}\n`, { mode: 0o600 });
} else if (process.env.SESSION_SECRET.length < 32) {
  throw new Error("SESSION_SECRET doit contenir au moins 32 caractères.");
}
const directory = join(process.cwd(), ".data");
mkdirSync(directory, { recursive: true, mode: 0o700 });
const db = new Database(join(directory, "edifycut.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(readFileSync(join(process.cwd(), "src/lib/account/schema.sql"), "utf8"));
const email = process.env.ADMIN_EMAIL || "admin@edifycut.local";
const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
if (existing) {
  console.log("Le compte existe déjà ; aucun identifiant modifié.");
} else {
  const password = randomBytes(18).toString("base64url");
  db.prepare("INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, 'admin')")
    .run(randomUUID(), email, "Administrateur", await hash(password, 12));
  writeFileSync(join(directory, "admin-credentials.txt"), `EdifyCut - accès administrateur local\nAdresse : ${email}\nMot de passe : ${password}\nConnexion : http://localhost:3000/account\nChangez le mot de passe depuis votre compte après connexion.\n`, { mode: 0o600 });
  console.log("Compte administrateur créé. Identifiants : .data/admin-credentials.txt");
}
db.close();
