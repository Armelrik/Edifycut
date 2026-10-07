import { currentUser } from "@/lib/account/session";
import { AccountError, accountError, checkOrigin, readBody } from "@/lib/account/http";
import { confirmPayment } from "@/lib/billing/paypal";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { checkOrigin(request); const user = await currentUser(); if (!user) throw new AccountError("Connectez-vous pour vérifier le paiement.", 401); const body = await readBody(request); if (typeof body.orderId !== "string") throw new AccountError("Commande invalide."); return Response.json({ proUntil: await confirmPayment(body.orderId, user.id) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return accountError(error); }
}
