import "server-only";
import { usingSupabase } from "@/lib/supabase/config";
import { supabaseAdmin, assertDatabase } from "@/lib/supabase/admin";
import { proDatabase, localProUntil } from "@/lib/account/database";
import { AccountError } from "@/lib/account/http";
export type SavedOrder = { id: string; user_id: string; paypal_id: string | null; capture_id: string | null; status: string; paid_until: string | null; created_at: number; mode: string };
function local() {
  const db = proDatabase();
  db.exec("CREATE TABLE IF NOT EXISTS paypal_orders (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, paypal_id TEXT UNIQUE, capture_id TEXT UNIQUE, status TEXT NOT NULL, paid_until TEXT, created_at INTEGER NOT NULL)");
  if (!(db.pragma("table_info(paypal_orders)") as { name: string }[]).some(column => column.name === "mode")) db.exec("ALTER TABLE paypal_orders ADD COLUMN mode TEXT NOT NULL DEFAULT 'sandbox'");
  return db;
}
export async function getOrder(paypalId: string): Promise<SavedOrder | undefined> {
  if (!usingSupabase()) return local().prepare("SELECT * FROM paypal_orders WHERE paypal_id = ?").get(paypalId) as SavedOrder | undefined;
  const { data, error } = await supabaseAdmin().from("paypal_orders").select("*").eq("paypal_id", paypalId).maybeSingle();
  assertDatabase(error); return data || undefined;
}
export async function pendingOrder(userId: string, mode: string) {
  const cutoff = Date.now() - 3 * 3600_000;
  if (!usingSupabase()) return local().prepare("SELECT * FROM paypal_orders WHERE user_id = ? AND status = 'CREATED' AND created_at > ? AND mode = ? ORDER BY created_at DESC LIMIT 1").get(userId, cutoff, mode) as SavedOrder | undefined;
  const { data, error } = await supabaseAdmin().from("paypal_orders").select("*").eq("user_id", userId).eq("mode", mode).eq("status", "CREATED").gt("created_at", cutoff).order("created_at", { ascending: false }).limit(1).maybeSingle();
  assertDatabase(error); return data as SavedOrder | undefined;
}
export async function reserveOrder(id: string, userId: string, mode: string) {
  const now = Date.now();
  if (usingSupabase()) {
    const { error } = await supabaseAdmin().rpc("reserve_paypal_order", { order_id: id, owner_id: userId, payment_mode: mode, current_time_ms: now });
    if (error) throw new AccountError("Un paiement est déjà en préparation ou ce compte dispose déjà de Pro.", 409);
    return;
  }
  const db = local();
  db.transaction(() => {
    if (db.prepare("SELECT id FROM paypal_orders WHERE user_id = ? AND status = 'CREATING' AND created_at > ?").get(userId, now - 120_000)) throw new AccountError("Un paiement est déjà en préparation. Réessayez dans un instant.", 409);
    db.prepare("INSERT INTO paypal_orders (id, user_id, status, created_at, mode) VALUES (?, ?, 'CREATING', ?, ?)").run(id, userId, now, mode);
  })();
}
export async function updateOrder(id: string, status: string, paypalId?: string) {
  if (usingSupabase()) {
    assertDatabase((await supabaseAdmin().from("paypal_orders").update({ status, ...(paypalId ? { paypal_id: paypalId } : {}) }).eq("id", id)).error); return;
  }
  if (paypalId) local().prepare("UPDATE paypal_orders SET paypal_id = ?, status = ? WHERE id = ?").run(paypalId, status, id);
  else local().prepare("UPDATE paypal_orders SET status = ? WHERE id = ?").run(status, id);
}
export async function completeOrder(saved: SavedOrder, captureId: string, until: string, mode: string) {
  if (usingSupabase()) {
    const { data, error } = await supabaseAdmin().rpc("finalize_paypal_order", { order_id: saved.id, owner_id: saved.user_id, payment_mode: mode, capture: captureId, expiry: until });
    assertDatabase(error); return data as string;
  }
  const db = local();
  return db.transaction(() => {
    const current = db.prepare("SELECT * FROM paypal_orders WHERE id = ?").get(saved.id) as SavedOrder;
    if (["REFUNDED", "REVERSED"].includes(current.status)) throw new AccountError("Paiement annulé.", 409);
    if (current.status === "COMPLETED") return current.paid_until;
    db.prepare("UPDATE paypal_orders SET status = 'COMPLETED', capture_id = ?, paid_until = ? WHERE id = ?").run(captureId, until, saved.id);
    const existing = localProUntil(saved.user_id);
    if (!existing || Date.parse(existing) < Date.parse(until)) db.prepare("INSERT INTO pro_access VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET expires_at = excluded.expires_at, granted_by = excluded.granted_by, updated_at = excluded.updated_at").run(saved.user_id, until, "paypal:" + mode + ":" + captureId, new Date().toISOString());
    return until;
  })();
}
export async function refundCapture(captureId: string, mode: string, status: string) {
  if (usingSupabase()) { assertDatabase((await supabaseAdmin().rpc("refund_paypal_capture", { capture: captureId, payment_mode: mode, new_status: status })).error); return; }
  const db = local();
  db.transaction(() => {
    db.prepare("UPDATE paypal_orders SET status = ? WHERE capture_id = ? AND mode = ?").run(status, captureId, mode);
    db.prepare("DELETE FROM pro_access WHERE granted_by = ?").run("paypal:" + mode + ":" + captureId);
  })();
}
