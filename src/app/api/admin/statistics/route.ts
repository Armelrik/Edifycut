import { currentUser } from "@/lib/account/session";
import { markPresent } from "@/lib/account/presence";
import { AccountError, accountError } from "@/lib/account/http";
import { usageStatistics } from "@/lib/admin/statistics";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const user = await currentUser();
    if (user?.role !== "admin") throw new AccountError("Accès administrateur requis.", 403);
    markPresent(user);
    return Response.json(await usageStatistics(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return accountError(error); }
}
