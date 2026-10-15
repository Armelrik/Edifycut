import "server-only";
import { supabaseAdmin, assertDatabase } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { currentUser } from "./session";
import { publicAccount, type Account } from "./database";
import { AccountError, validName, validPassword } from "./http";
function emailAddress(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AccountError("Indiquez une adresse e-mail valide.");
  return email;
}
function authFailure(error: { status?: number } | null) {
  if (!error) return;
  if (error.status === 429) throw new AccountError("Trop de tentatives. Réessayez plus tard.", 429);
  throw new AccountError("La demande n’a pas abouti. Vérifiez vos informations et la confirmation de votre e-mail.", 400);
}
export function applicationOrigin() {
  const value = process.env.APP_URL;
  if (!value) throw new AccountError("Configurez APP_URL pour les liens de connexion.", 503);
  const url = new URL(value);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") throw new AccountError("APP_URL doit utiliser HTTPS.", 503);
  return url.origin;
}
export async function cloudAccountAction(action: string, body: Record<string, unknown>) {
  const client = await supabaseServer();
  if (action === "logout" || action === "logout-all") {
    const { data: { user } } = await client.auth.getUser();
    if (user) { try { await supabaseAdmin().from("user_presence").delete().eq("user_id", user.id); } catch { /* Presence expires without blocking logout. */ } }
    authFailure((await client.auth.signOut({ scope: action === "logout-all" ? "global" : "local" })).error);
    return { ok: true };
  }
  if (action === "login") {
    const email = emailAddress(body.email);
    const password = typeof body.password === "string" ? body.password : "";
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new AccountError(error.status === 429 ? "Trop de tentatives. Réessayez plus tard." : "Adresse e-mail, mot de passe ou confirmation de compte incorrects.", error.status === 429 ? 429 : 401);
    const user = await currentUser();
    if (!user) { await client.auth.signOut(); throw new AccountError("Ce compte ne dispose pas d’un accès actif.", 403); }
    return { user: await publicAccount(user) };
  }
  if (action === "register") {
    const { error, data } = await client.auth.signUp({ email: emailAddress(body.email), password: validPassword(body.password), options: { data: { name: validName(body.name) }, emailRedirectTo: applicationOrigin() + "/auth/confirm" } });
    authFailure(error);
    return { ok: true, message: data.session ? "Compte créé. Vous êtes connecté." : "Vérifiez votre messagerie pour confirmer votre compte. Si cette adresse est déjà utilisée, connectez-vous ou réinitialisez votre mot de passe." };
  }
  if (action === "reset") {
    const { error } = await client.auth.resetPasswordForEmail(emailAddress(body.email), { redirectTo: applicationOrigin() + "/account/reset" });
    authFailure(error);
    return { ok: true, message: "Si cette adresse possède un compte, un e-mail de récupération a été envoyé." };
  }
  if (action === "resend") {
    const { error } = await client.auth.resend({ type: "signup", email: emailAddress(body.email), options: { emailRedirectTo: applicationOrigin() + "/auth/confirm" } });
    authFailure(error);
    return { ok: true, message: "Si une confirmation est nécessaire pour cette adresse, un nouveau lien a été envoyé." };
  }
  if (action === "recover") {
    const password = validPassword(body.password);
    if (typeof body.tokenHash !== "string" || !body.tokenHash || body.tokenHash.length > 2048) throw new AccountError("Le lien de récupération est invalide. Demandez-en un nouveau.");
    authFailure((await client.auth.verifyOtp({ token_hash: body.tokenHash, type: "recovery" })).error);
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new AccountError("Lien de récupération expiré.", 401);
    const profile = await client.from("profiles").select("disabled").eq("id", user.id).single();
    assertDatabase(profile.error);
    if (profile.data?.disabled) { await client.auth.signOut(); throw new AccountError("Compte désactivé.", 403); }
    authFailure((await client.auth.updateUser({ password })).error);
    await client.auth.signOut({ scope: "others" });
    return { ok: true, message: "Mot de passe réinitialisé." };
  }
  const user = await currentUser();
  if (!user) throw new AccountError("Connectez-vous pour continuer.", 401);
  if (action === "profile") {
    assertDatabase((await supabaseAdmin().from("profiles").update({ name: validName(body.name) }).eq("id", user.id)).error);
  } else if (action === "password") {
    if (typeof body.currentPassword !== "string") throw new AccountError("Indiquez le mot de passe actuel.");
    const password = validPassword(body.password);
    const verified = await client.auth.signInWithPassword({ email: user.email, password: body.currentPassword });
    if (verified.error) throw new AccountError("Le mot de passe actuel est incorrect.", 401);
    authFailure((await client.auth.updateUser({ password })).error);
    await client.auth.signOut({ scope: "others" });
  } else throw new AccountError("Action inconnue.", 404);
  return { ok: true };
}
export async function cloudUsers(): Promise<Account[]> {
  const client = supabaseAdmin(), users: Account[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.from("profiles").select("*,pro_access(expires_at,granted_by)").order("created_at", { ascending: false }).order("id").range(offset, offset + 999);
    assertDatabase(error);
    for (const { pro_access: access, ...profile } of data || []) {
      const until = process.env.PAYPAL_ENV === "live" && access?.granted_by.startsWith("paypal:sandbox:") ? null : access?.expires_at ?? null;
      users.push({ ...profile, disabled: Number(profile.disabled), password_hash: "", pro_until: until } as Account);
    }
    if (!data || data.length < 1000) return users;
  }
}
export async function cloudAdminUpdate(actor: Account, body: Record<string, unknown>) {
  if (typeof body.id !== "string") throw new AccountError("Compte invalide.");
  if (body.role !== undefined && (typeof body.role !== "string" || !["user", "admin"].includes(body.role))) throw new AccountError("Rôle invalide.");
  if (body.disabled !== undefined && typeof body.disabled !== "boolean") throw new AccountError("Statut invalide.");
  if (body.proAction !== undefined && (typeof body.proAction !== "string" || !["grant", "revoke"].includes(body.proAction))) throw new AccountError("Action Pro invalide.");
  const client = supabaseAdmin();
  if (body.password !== undefined) {
    if (body.role !== undefined || body.disabled !== undefined || body.proAction !== undefined) throw new AccountError("Modifiez le mot de passe séparément des autres réglages.");
    const password = validPassword(body.password);
    const { data, error } = await client.from("profiles").select("id").eq("id", body.id).single();
    assertDatabase(error);
    if (!data) throw new AccountError("Compte introuvable.", 404);
    authFailure((await client.auth.admin.updateUserById(body.id, { password })).error);
  }
  const { error } = await client.rpc("admin_update_account", { actor_id: actor.id, target_id: body.id, new_role: body.role ?? null, new_disabled: body.disabled ?? null, pro_action: body.proAction ?? null, bump_version: body.password !== undefined, live_mode: process.env.PAYPAL_ENV === "live" });
  if (error) throw new AccountError("Modification refusée : vérifiez les droits, le compte et la présence d’au moins un administrateur actif.", 400);
}
export async function cloudAdminCreate(body: Record<string, unknown>) {
  const role = body.role ?? "user";
  if (typeof role !== "string" || !["user", "admin"].includes(role)) throw new AccountError("Rôle invalide.");
  const client = supabaseAdmin();
  const { data, error } = await client.auth.admin.createUser({ email: emailAddress(body.email), password: validPassword(body.password), email_confirm: true, user_metadata: { name: validName(body.name) } });
  authFailure(error);
  if (!data.user) throw new AccountError("Création du compte impossible.", 503);
  const updated = await client.from("profiles").update({ role }).eq("id", data.user.id).select("id").single();
  if (updated.error) { await client.auth.admin.deleteUser(data.user.id); assertDatabase(updated.error); }
}
