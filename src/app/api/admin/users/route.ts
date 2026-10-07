import { hash } from "bcryptjs";
import { randomUUID } from "node:crypto";
import { database, proDatabase, proUntil, publicAccount, type Account } from "@/lib/account/database";
import { currentUser } from "@/lib/account/session";
import { AccountError, accountError, checkOrigin, readBody, validPassword, validName } from "@/lib/account/http";

export const runtime = "nodejs";
async function admin() {
  const user = await currentUser();
  if (!user || user.role !== "admin") throw new AccountError("Accès administrateur requis.", 403);
  return user;
}

export async function GET() {
  try {
    await admin();
    const users = database().prepare("SELECT * FROM users ORDER BY created_at DESC").all() as Account[];
    return Response.json({ users: users.map(publicAccount) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return accountError(error); }
}

export async function PATCH(request: Request) {
  try {
    checkOrigin(request);
    const actor = await admin();
    const body = await readBody(request);
    const db = database();
    if (typeof body.id !== "string") throw new AccountError("Compte invalide.");
    if (body.role !== undefined && !["admin", "user"].includes(body.role)) throw new AccountError("Rôle invalide.");
    if (body.disabled !== undefined && typeof body.disabled !== "boolean") throw new AccountError("Statut invalide.");
    if (body.proAction !== undefined && !["grant", "revoke"].includes(body.proAction)) throw new AccountError("Action Pro invalide.");
    if (body.proAction) proDatabase();
    const passwordHash = body.password !== undefined ? await hash(validPassword(body.password), 12) : null;
    db.transaction(() => {
      const target = db.prepare("SELECT * FROM users WHERE id = ?").get(body.id) as Account | undefined;
      if (!target) throw new AccountError("Compte introuvable.", 404);
      const role = body.role ?? target.role;
      const disabled = body.disabled === undefined ? target.disabled : Number(body.disabled);
      if (actor.id === target.id && (disabled || role !== "admin")) throw new AccountError("Vous ne pouvez pas retirer votre propre accès administrateur.");
      const count = db.prepare("SELECT COUNT(*) AS total FROM users WHERE role = 'admin' AND disabled = 0").get() as { total: number };
      if (target.role === "admin" && !target.disabled && (disabled || role !== "admin") && count.total <= 1) throw new AccountError("Conservez au moins un administrateur actif.");
      if (body.proAction === "revoke") db.prepare("DELETE FROM pro_access WHERE user_id = ?").run(target.id);
      if (body.proAction === "grant") {
        if (disabled) throw new AccountError("Réactivez le compte avant de lui accorder Pro.");
        const expiry = new Date(Math.max(Date.now(), Date.parse(proUntil(target.id) || "") || 0));
        expiry.setUTCFullYear(expiry.getUTCFullYear() + 1);
        db.prepare("INSERT INTO pro_access VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET expires_at = excluded.expires_at, granted_by = excluded.granted_by, updated_at = excluded.updated_at").run(target.id, expiry.toISOString(), actor.id, new Date().toISOString());
      }
      if (body.role !== undefined || body.disabled !== undefined || passwordHash) db.prepare("UPDATE users SET role = ?, disabled = ?, password_hash = ?, session_version = session_version + 1 WHERE id = ?")
        .run(role, disabled, passwordHash ?? target.password_hash, target.id);
    })();
    return Response.json({ ok: true });
  } catch (error) { return accountError(error); }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request); await admin();
    const body = await readBody(request);
    const name = validName(body.name), password = validPassword(body.password);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AccountError("Indiquez une adresse e-mail valide.");
    const role = body.role ?? "user";
    if (role !== "user" && role !== "admin") throw new AccountError("Rôle invalide.");
    const id = randomUUID(), passwordHash = await hash(password, 12);
    try { database().prepare("INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)").run(id, email, name, passwordHash, role); }
    catch (error) { if ((error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") throw new AccountError("Cette adresse e-mail possède déjà un compte.", 409); throw error; }
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) { return accountError(error); }
}
