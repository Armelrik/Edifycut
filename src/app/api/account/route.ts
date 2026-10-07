import { currentUser } from "@/lib/account/session";
import { publicAccount } from "@/lib/account/database";
import { accountError } from "@/lib/account/http";

export const runtime = "nodejs";
export async function GET() {
  try {
    const user = await currentUser();
    return Response.json({ user: user ? publicAccount(user) : null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return accountError(error); }
}
