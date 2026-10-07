import { currentUser } from "@/lib/account/session";
import { markPresent } from "@/lib/account/presence";
import { AccountError, accountError, checkOrigin } from "@/lib/account/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await currentUser();
    if (!user) throw new AccountError("Authentification requise.", 401);
    markPresent(user);
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return accountError(error); }
}
