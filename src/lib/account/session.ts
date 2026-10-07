import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { database, type Account } from "./database";

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

export async function currentUser(): Promise<Account | null> {
  if (!process.env.SESSION_SECRET) return null;
  const auth = await session();
  if (!auth.userId) return null;
  const user = database().prepare("SELECT * FROM users WHERE id = ?").get(auth.userId) as Account | undefined;
  return user && !user.disabled && user.session_version === auth.version ? user : null;
}
