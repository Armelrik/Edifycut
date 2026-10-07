import { randomUUID } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { database, publicAccount, type Account } from "@/lib/account/database";
import { session, currentUser } from "@/lib/account/session";
import { presenceTable } from "@/lib/account/presence";
import { AccountError, accountError, checkOrigin, readBody, validName, validPassword } from "@/lib/account/http";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  try {
    checkOrigin(request);
    const { action } = await context.params;
    const auth = await session();
    if (action === "logout") {
      if (auth.userId) presenceTable().prepare("DELETE FROM user_presence WHERE user_id = ? AND version = ?").run(auth.userId, auth.version ?? 0);
      auth.destroy(); return Response.json({ ok: true });
    }
    const body = await readBody(request);
    const db = database();
    if (action === "login" || action === "register") {
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AccountError("Indiquez une adresse e-mail valide.");
      const key = `${action}:${email}`;
      const now = Date.now();
      db.prepare("DELETE FROM auth_attempts WHERE expires < ?").run(now);
      db.prepare("INSERT INTO auth_attempts (key, count, expires) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1").run(key, now + 10 * 60_000);
      const attempts = db.prepare("SELECT count FROM auth_attempts WHERE key = ?").get(key) as { count: number };
      if (attempts.count > 10) throw new AccountError("Trop de tentatives. Réessayez dans 10 minutes.", 429);
      let user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as Account | undefined;
      if (action === "register") {
        if (user) throw new AccountError("Un compte existe déjà avec cette adresse.", 409);
        const name = validName(body.name);
        const passwordHash = await hash(validPassword(body.password), 12);
        const id = randomUUID();
        try { db.prepare("INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)").run(id, email, name, passwordHash); }
        catch (error) {
          if ((error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") throw new AccountError("Un compte existe déjà avec cette adresse.", 409);
          throw error;
        }
        user = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as Account;
      } else {
        const supplied = typeof body.password === "string" && Buffer.byteLength(body.password) <= 72 ? body.password : "";
        // Compare even for unknown accounts to avoid a fast user-existence signal.
        const dummy = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.8bKtfPxtOlbhVcTCBMUCRVXj3sCXoDa";
        const matches = await compare(supplied, user?.password_hash ?? dummy);
        if (!user || user.disabled || !matches) throw new AccountError("Adresse e-mail ou mot de passe incorrect.", 401);
      }
      auth.userId = user.id;
      auth.version = user.session_version;
      await auth.save();
      db.prepare("DELETE FROM auth_attempts WHERE key = ?").run(key);
      return Response.json({ user: publicAccount(user) });
    }
    const user = await currentUser();
    if (!user) throw new AccountError("Connectez-vous pour continuer.", 401);
    if (action === "profile") {
      db.prepare("UPDATE users SET name = ? WHERE id = ?").run(validName(body.name), user.id);
    } else if (action === "password") {
      if (typeof body.currentPassword !== "string" || Buffer.byteLength(body.currentPassword) > 72 || !await compare(body.currentPassword, user.password_hash)) {
        throw new AccountError("Le mot de passe actuel est incorrect.", 401);
      }
      db.prepare("UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?").run(await hash(validPassword(body.password), 12), user.id);
      auth.version = user.session_version + 1;
      await auth.save();
    } else throw new AccountError("Action inconnue.", 404);
    return Response.json({ ok: true });
  } catch (error) { return accountError(error); }
}
