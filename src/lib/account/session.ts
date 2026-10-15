import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { database, type Account } from "./database";
import { cache } from "react";
import { usingSupabase } from "@/lib/supabase/config";
import { supabaseServer } from "@/lib/supabase/server";
import { assertDatabase } from "@/lib/supabase/admin";

export async function session() {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) throw new Error("Configurez SESSION_SECRET avec npm run setup:admin.");
  return getIronSession<{ userId?: string; version?: number }>(await cookies(), {
    password,
    cookieName: "edifycut-session",
    ttl: 7 * 24 * 3600,
    cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" },
  });
}

export const currentUser = cache(async (): Promise<Account | null> => {
  if (usingSupabase()) {
    const client = await supabaseServer();
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return null;
    const { data, error: profileError } = await client.from("profiles").select("*").eq("id", user.id).maybeSingle();
    assertDatabase(profileError);
    if (!data || data.disabled) return null;
    return { ...data, email: user.email || data.email, disabled: Number(data.disabled), password_hash: "" } as Account;
  }
  if (process.env.VERCEL) return null;
  if (!process.env.SESSION_SECRET) return null;
  const auth = await session();
  if (!auth.userId) return null;
  const user = database().prepare("SELECT * FROM users WHERE id = ?").get(auth.userId) as Account | undefined;
  return user && !user.disabled && user.session_version === auth.version ? user : null;
});
