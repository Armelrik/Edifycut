import "server-only";
import { connection } from "next/server";
import { auth } from "./auth";
import { query } from "./database";
import { currentUser } from "@/lib/account/session";
import { liveMode, type Account } from "@/lib/account/database";
import { AccountError, validName, validPassword } from "@/lib/account/http";

function email(value: unknown) {
  if (typeof value !== "string" || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) throw new AccountError("Indiquez une adresse e-mail valide.");
  return value.trim().toLowerCase();
}
function checked(result: { error?: { message?: string; status?: number; code?: string } | null }) {
  if (result.error) throw new AccountError(result.error.message || "La demande d’authentification a échoué.", result.error.status === 429 ? 429 : 400);
}

export async function neonAccount(): Promise<Account | null> {
  await connection(); // la session dépend de la requête : pas de pré-rendu statique
  const { data, error } = await auth.getSession();
  if (error || !data?.user) return null;
  const user = data.user;
  // Lecture simple dans le cas courant ; écriture seulement à la première connexion ou si l’e-mail a changé.
  let [profile] = await query<Account>("SELECT * FROM edifycut.profiles WHERE id = $1", [user.id]);
  if (!profile || profile.email !== user.email) {
    [profile] = await query<Account>(`INSERT INTO edifycut.profiles(id, email, name) VALUES ($1, $2, $3)
      ON CONFLICT (id) DO UPDATE SET email = excluded.email RETURNING *`, [user.id, user.email, user.name || "Utilisateur"]);
  }
  return profile && !profile.disabled ? profile : null;
}

export async function neonAccountAction(action: string, body: Record<string, unknown>) {
  if (action === "login") {
    const result = await auth.signIn.email({ email: email(body.email), password: typeof body.password === "string" ? body.password : "" });
    if (result.error) throw new AccountError(result.error.status === 429 ? "Trop de tentatives. Réessayez dans quelques minutes." : "Adresse e-mail, mot de passe ou confirmation de compte incorrects.", result.error.status === 429 ? 429 : 401);
    return { ok: true };
  }
  if (action === "register") {
    checked(await auth.signUp.email({ email: email(body.email), name: validName(body.name), password: validPassword(body.password) }));
    return { ok: true, message: "Compte créé. Si une vérification est demandée, saisissez le code reçu par e-mail." };
  }
  if (action === "logout" || action === "logout-all") {
    if (action === "logout-all") checked(await auth.revokeSessions());
    checked(await auth.signOut());
    return { ok: true };
  }
  const user = await currentUser();
  if (!user) throw new AccountError("Connectez-vous pour continuer.", 401);
  if (action === "profile") {
    const name = validName(body.name);
    checked(await auth.updateUser({ name }));
    await query("UPDATE edifycut.profiles SET name = $1 WHERE id = $2", [name, user.id]);
  } else if (action === "password") {
    checked(await auth.changePassword({ currentPassword: String(body.currentPassword || ""), newPassword: validPassword(body.password), revokeOtherSessions: true }));
  } else throw new AccountError("Action inconnue.", 404);
  return { ok: true };
}

export async function neonUsers() {
  return query<Account>(`SELECT p.*,
    CASE WHEN $1 AND a.granted_by LIKE 'paypal:sandbox:%' THEN NULL ELSE a.expires_at END AS pro_until
    FROM edifycut.profiles p LEFT JOIN edifycut.pro_access a ON a.user_id = p.id ORDER BY p.created_at DESC`, [liveMode()]);
}

const ADMIN_ERRORS: Record<string, string> = {
  "admin required": "Accès administrateur requis.",
  "cannot remove own access": "Vous ne pouvez pas retirer votre propre accès administrateur.",
  "last administrator": "Conservez au moins un administrateur actif.",
  "disabled account": "Réactivez le compte avant de lui accorder Pro.",
};

export async function neonAdminUpdate(actor: Account, body: Record<string, unknown>) {
  if (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id)) throw new AccountError("Compte invalide.");
  if (body.password !== undefined) {
    // Les API d’administration de Neon Auth exigent une session admin Auth, distincte des rôles applicatifs.
    throw new AccountError("Utilisez la récupération par e-mail pour modifier le mot de passe de ce compte.");
  }
  if (body.role !== undefined && !["user", "admin"].includes(String(body.role))) throw new AccountError("Rôle invalide.");
  if (body.disabled !== undefined && typeof body.disabled !== "boolean") throw new AccountError("Statut invalide.");
  if (body.proAction !== undefined && !["grant", "revoke"].includes(String(body.proAction))) throw new AccountError("Action Pro invalide.");
  try {
    await query("SELECT edifycut.admin_update_account($1, $2, $3, $4, $5, false, $6)", [actor.id, body.id, body.role ?? null, body.disabled ?? null, body.proAction ?? null, liveMode()]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (ADMIN_ERRORS[message]) throw new AccountError(ADMIN_ERRORS[message], message === "admin required" ? 403 : 400);
    if ((error as { code?: string }).code === "P0002") throw new AccountError("Compte introuvable.", 404);
    throw error;
  }
}
