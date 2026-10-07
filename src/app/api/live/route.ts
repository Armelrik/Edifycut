import { currentUser } from "@/lib/account/session";
import { AccountError, checkOrigin, readBody, accountError } from "@/lib/account/http";
import { createLive, listLive } from "@/lib/live/capture";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const user = await currentUser();
    if (!user) throw new AccountError("Connectez-vous pour accéder aux captures.", 401);
    return Response.json({ sessions: listLive(user.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return accountError(error); }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await currentUser();
    if (!user) throw new AccountError("Connectez-vous pour capturer un direct.", 401);
    const body = await readBody(request);
    return Response.json(createLive(user.id, body.url), { status: 202 });
  } catch (error) { return accountError(error); }
}
