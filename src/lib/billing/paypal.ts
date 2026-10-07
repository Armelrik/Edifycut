import "server-only";
import { randomUUID } from "node:crypto";
import { proDatabase, proUntil } from "@/lib/account/database";
import { AccountError } from "@/lib/account/http";
import { hasPro } from "@/lib/plans";
export function paypalConfigured() { return !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET && process.env.PAYPAL_WEBHOOK_ID && process.env.APP_URL); }
export function paypalSandbox() { return process.env.PAYPAL_ENV !== "live"; }
const base = () => paypalSandbox() ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
const mode = () => paypalSandbox() ? "sandbox" : "live";
async function paypal<T>(path: string, method = "GET", body?: unknown, requestId?: string): Promise<T> {
  if (!paypalConfigured()) throw new AccountError("Le paiement PayPal n’est pas encore configuré.", 503);
  const tokenResponse = await fetch(base() + "/v1/oauth2/token", { method: "POST", headers: { Authorization: "Basic " + Buffer.from(process.env.PAYPAL_CLIENT_ID + ":" + process.env.PAYPAL_CLIENT_SECRET).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials", cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!tokenResponse.ok) throw new AccountError("Connexion à PayPal indisponible.", 502);
  const token = await tokenResponse.json() as { access_token: string };
  const response = await fetch(base() + path, { method, headers: { Authorization: "Bearer " + token.access_token, "Content-Type": "application/json", Prefer: "return=representation", ...(requestId ? { "PayPal-Request-Id": requestId } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new AccountError("PayPal n’a pas confirmé cette opération. Réessayez depuis l’offre Pro.", 502);
  return await response.json() as T;
}
type Capture = { id: string; status: string; amount: { value: string; currency_code: string } };
type Order = { id: string; status: string; links?: { rel: string; href: string }[]; purchase_units?: { custom_id: string; amount: { value: string; currency_code: string }; payments?: { captures?: Capture[] } }[] };
type SavedOrder = { id: string; user_id: string; paypal_id: string | null; capture_id: string | null; status: string; paid_until: string | null; created_at: number; mode: string };
function billingDatabase() {
  const db = proDatabase();
  db.exec("CREATE TABLE IF NOT EXISTS paypal_orders (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, paypal_id TEXT UNIQUE, capture_id TEXT UNIQUE, status TEXT NOT NULL, paid_until TEXT, created_at INTEGER NOT NULL)");
  if (!(db.pragma("table_info(paypal_orders)") as { name: string }[]).some(column => column.name === "mode")) db.exec("ALTER TABLE paypal_orders ADD COLUMN mode TEXT NOT NULL DEFAULT 'sandbox'");
  return db;
}
function approval(order: Order) {
  const href = order.links?.find(link => ["approve", "payer-action"].includes(link.rel))?.href;
  if (!href) throw new AccountError("PayPal n’a pas fourni de lien de paiement.", 502);
  const url = new URL(href);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".paypal.com")) throw new AccountError("Lien de paiement invalide.", 502);
  return href;
}
export async function createPayment(userId: string) {
  if (!paypalConfigured()) throw new AccountError("Le paiement PayPal n’est pas encore configuré.", 503);
  if (hasPro(proUntil(userId))) throw new AccountError("Votre accès Pro est déjà actif.", 409);
  const app = new URL(process.env.APP_URL || "http://localhost");
  if (!paypalSandbox() && app.protocol !== "https:") throw new AccountError("Le paiement réel exige une adresse APP_URL en HTTPS.", 503);
  const db = billingDatabase(), now = Date.now();
  const pending = db.prepare("SELECT * FROM paypal_orders WHERE user_id = ? AND status = 'CREATED' AND created_at > ? AND mode = ? ORDER BY created_at DESC LIMIT 1").get(userId, now - 3 * 3600_000, mode()) as SavedOrder | undefined;
  if (pending?.paypal_id) {
    const order = await paypal<Order>("/v2/checkout/orders/" + pending.paypal_id);
    if (order.status === "CREATED" || order.status === "PAYER_ACTION_REQUIRED") return approval(order);
    if (order.status === "APPROVED") { await confirmPayment(pending.paypal_id, userId); throw new AccountError("Paiement confirmé. Actualisez votre compte.", 409); }
    if (order.status === "COMPLETED") { fulfill(order); throw new AccountError("Paiement confirmé. Actualisez votre compte.", 409); }
  }
  const id = randomUUID();
  db.transaction(() => {
    if (db.prepare("SELECT id FROM paypal_orders WHERE user_id = ? AND status = 'CREATING' AND created_at > ?").get(userId, now - 120_000)) throw new AccountError("Un paiement est déjà en préparation. Réessayez dans un instant.", 409);
    db.prepare("INSERT INTO paypal_orders (id, user_id, status, created_at, mode) VALUES (?, ?, 'CREATING', ?, ?)").run(id, userId, now, mode());
  })();
  try {
    const order = await paypal<Order>("/v2/checkout/orders", "POST", { intent: "CAPTURE", purchase_units: [{ custom_id: userId, description: "EdifyCut Pro - accès un an, sans renouvellement automatique", amount: { currency_code: "EUR", value: "5.99" } }], payment_source: { paypal: { experience_context: { brand_name: "EdifyCut", user_action: "PAY_NOW", shipping_preference: "NO_SHIPPING", return_url: new URL("/pro?paypal=approved", app).href, cancel_url: new URL("/pro?paypal=cancelled", app).href } } } }, id);
    db.prepare("UPDATE paypal_orders SET paypal_id = ?, status = 'CREATED' WHERE id = ?").run(order.id, id);
    return approval(order);
  } catch (error) { db.prepare("UPDATE paypal_orders SET status = 'ERROR' WHERE id = ?").run(id); throw error; }
}
function fulfill(order: Order) {
  const db = billingDatabase();
  return db.transaction(() => {
    const saved = db.prepare("SELECT * FROM paypal_orders WHERE paypal_id = ?").get(order.id) as SavedOrder | undefined;
    if (!saved || saved.mode !== mode()) throw new AccountError("Commande inconnue.", 404);
    if (saved.status === "REFUNDED" || saved.status === "REVERSED") throw new AccountError("Ce paiement n’est plus valide.", 409);
    if (saved.status === "COMPLETED") return saved.paid_until;
    const units = order.purchase_units, unit = units?.[0], captures = unit?.payments?.captures, capture = captures?.[0];
    if (order.status !== "COMPLETED" || units?.length !== 1 || unit?.custom_id !== saved.user_id || unit.amount.currency_code !== "EUR" || unit.amount.value !== "5.99" || captures?.length !== 1 || capture?.status !== "COMPLETED" || capture.amount.currency_code !== "EUR" || capture.amount.value !== "5.99") throw new AccountError("Le paiement de 5,99 EUR n’est pas encore confirmé.", 409);
    const expiry = new Date(); expiry.setUTCFullYear(expiry.getUTCFullYear() + 1);
    const until = expiry.toISOString();
    db.prepare("UPDATE paypal_orders SET status = 'COMPLETED', capture_id = ?, paid_until = ? WHERE id = ?").run(capture.id, until, saved.id);
    const existing = proUntil(saved.user_id);
    if (!existing || Date.parse(existing) < Date.parse(until)) db.prepare("INSERT INTO pro_access VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET expires_at = excluded.expires_at, granted_by = excluded.granted_by, updated_at = excluded.updated_at").run(saved.user_id, until, "paypal:" + mode() + ":" + capture.id, new Date().toISOString());
    return until;
  })();
}
export async function confirmPayment(orderId: string, userId?: string) {
  if (!/^[A-Z0-9]{10,32}$/.test(orderId)) throw new AccountError("Commande invalide.");
  const saved = billingDatabase().prepare("SELECT * FROM paypal_orders WHERE paypal_id = ?").get(orderId) as SavedOrder | undefined;
  if (!saved || saved.mode !== mode() || userId && saved.user_id !== userId) throw new AccountError("Commande introuvable.", 404);
  if (["REFUNDED", "REVERSED"].includes(saved.status)) throw new AccountError("Paiement annulé.", 409);
  let order = await paypal<Order>("/v2/checkout/orders/" + orderId);
  if (order.status === "APPROVED") {
    try { order = await paypal<Order>("/v2/checkout/orders/" + orderId + "/capture", "POST", {}, saved.id + "-capture"); }
    catch { order = await paypal<Order>("/v2/checkout/orders/" + orderId); }
  }
  return fulfill(order);
}
type Webhook = { event_type: string; resource: { id?: string; supplementary_data?: { related_ids?: { order_id?: string; capture_id?: string } }; links?: { rel: string; href: string }[] } };
export async function handleWebhook(request: Request) {
  const text = await request.text();
  if (text.length > 256_000) throw new AccountError("Notification trop volumineuse.", 413);
  let event: Webhook; try { event = JSON.parse(text); } catch { throw new AccountError("Notification invalide."); }
  const verification = await paypal<{ verification_status: string }>("/v1/notifications/verify-webhook-signature", "POST", { auth_algo: request.headers.get("paypal-auth-algo"), cert_url: request.headers.get("paypal-cert-url"), transmission_id: request.headers.get("paypal-transmission-id"), transmission_sig: request.headers.get("paypal-transmission-sig"), transmission_time: request.headers.get("paypal-transmission-time"), webhook_id: process.env.PAYPAL_WEBHOOK_ID, webhook_event: event });
  if (verification.verification_status !== "SUCCESS") throw new AccountError("Signature PayPal invalide.", 403);
  if (event.event_type === "CHECKOUT.ORDER.APPROVED" && event.resource.id) {
    const saved = billingDatabase().prepare("SELECT id FROM paypal_orders WHERE paypal_id = ?").get(event.resource.id);
    if (saved) await confirmPayment(event.resource.id);
  }
  if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
    const orderId = event.resource.supplementary_data?.related_ids?.order_id;
    if (orderId && billingDatabase().prepare("SELECT id FROM paypal_orders WHERE paypal_id = ?").get(orderId)) await confirmPayment(orderId);
  }
  if (["PAYMENT.CAPTURE.REFUNDED", "PAYMENT.CAPTURE.REVERSED"].includes(event.event_type)) {
    const captureId = event.resource.supplementary_data?.related_ids?.capture_id || (event.event_type === "PAYMENT.CAPTURE.REVERSED" ? event.resource.id : event.resource.links?.find(link => link.rel === "up")?.href.split("/").at(-1));
    if (captureId) {
      const db = billingDatabase();
      db.transaction(() => { db.prepare("UPDATE paypal_orders SET status = ? WHERE capture_id = ? AND mode = ?").run(event.event_type.endsWith("REFUNDED") ? "REFUNDED" : "REVERSED", captureId, mode()); db.prepare("DELETE FROM pro_access WHERE granted_by = ?").run("paypal:" + mode() + ":" + captureId); })();
    }
  }
}
