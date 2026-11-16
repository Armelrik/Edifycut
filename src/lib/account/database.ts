import "server-only";
import { query } from "@/lib/neon/database";

export type Account = {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  disabled: boolean;
  session_version: number;
  created_at: string;
  pro_until?: string | null;
};

export async function publicAccount(user: Account) {
  return { id: user.id, email: user.email, name: user.name, role: user.role, disabled: Boolean(user.disabled), createdAt: user.created_at, proUntil: user.pro_until !== undefined ? user.pro_until : await proUntil(user.id) };
}

/** Un accès accordé par un paiement Sandbox ne compte pas en mode PayPal live. */
export const liveMode = () => process.env.PAYPAL_ENV === "live";

export async function proUntil(id: string): Promise<string | null> {
  const [row] = await query<{ expires_at: string; granted_by: string }>("SELECT expires_at, granted_by FROM edifycut.pro_access WHERE user_id = $1", [id]);
  if (!row || (liveMode() && row.granted_by.startsWith("paypal:sandbox:"))) return null;
  return row.expires_at;
}
