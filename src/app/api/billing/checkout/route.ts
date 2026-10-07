import { currentUser } from "@/lib/account/session";
import { AccountError, accountError, checkOrigin } from "@/lib/account/http";
import { createPayment } from "@/lib/billing/paypal";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { checkOrigin(request); const user = await currentUser(); if (!user) throw new AccountError("Connectez-vous avant de payer.", 401); return Response.json({ url: await createPayment(user.id) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return accountError(error); }
}
