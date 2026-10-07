import { handleWebhook } from "@/lib/billing/paypal";
import { accountError } from "@/lib/account/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { await handleWebhook(request); return Response.json({ ok: true }); }
  catch (error) { return accountError(error); }
}
