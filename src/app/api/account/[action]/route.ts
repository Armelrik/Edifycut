import { neonAccountAction } from "@/lib/neon/accounts";
import { accountError, checkOrigin, readBody } from "@/lib/account/http";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  try {
    checkOrigin(request);
    const { action } = await context.params;
    return Response.json(await neonAccountAction(action, await readBody(request)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return accountError(error); }
}
