import "server-only";
import { query } from "@/lib/neon/database";
import { AccountError } from "@/lib/account/http";

export type SavedOrder = { id: string; user_id: string; paypal_id: string | null; capture_id: string | null; status: string; paid_until: string | null; created_at: number; mode: string };

export async function getOrder(paypalId: string): Promise<SavedOrder | undefined> {
  const [order] = await query<SavedOrder>("SELECT * FROM edifycut.paypal_orders WHERE paypal_id = $1", [paypalId]);
  return order;
}

export async function pendingOrder(userId: string, mode: string): Promise<SavedOrder | undefined> {
  const [order] = await query<SavedOrder>(`SELECT * FROM edifycut.paypal_orders
    WHERE user_id = $1 AND mode = $2 AND status = 'CREATED' AND created_at > $3 ORDER BY created_at DESC LIMIT 1`, [userId, mode, Date.now() - 3 * 3600_000]);
  return order;
}

export async function reserveOrder(id: string, userId: string, mode: string) {
  try {
    await query("SELECT edifycut.reserve_paypal_order($1, $2, $3, $4)", [id, userId, mode, Date.now()]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (["inactive account", "already pro", "payment in progress"].includes(message)) throw new AccountError("Un paiement est déjà en préparation ou ce compte dispose déjà de Pro.", 409);
    throw error;
  }
}

export async function updateOrder(id: string, status: string, paypalId?: string) {
  if (paypalId) await query("UPDATE edifycut.paypal_orders SET status = $1, paypal_id = $2 WHERE id = $3", [status, paypalId, id]);
  else await query("UPDATE edifycut.paypal_orders SET status = $1 WHERE id = $2", [status, id]);
}

export async function completeOrder(saved: SavedOrder, captureId: string, until: string, mode: string) {
  try {
    const [row] = await query<{ paid_until: string }>("SELECT edifycut.finalize_paypal_order($1, $2, $3, $4, $5) AS paid_until", [saved.id, saved.user_id, mode, captureId, until]);
    return row.paid_until;
  } catch (error) {
    if (error instanceof Error && error.message === "payment revoked") throw new AccountError("Paiement annulé.", 409);
    throw error;
  }
}

export async function refundCapture(captureId: string, mode: string, status: string) {
  await query("SELECT edifycut.refund_paypal_capture($1, $2, $3)", [captureId, mode, status]);
}
