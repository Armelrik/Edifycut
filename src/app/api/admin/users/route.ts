import { neonUsers, neonAdminUpdate } from "@/lib/neon/accounts";
import { publicAccount } from "@/lib/account/database";
import { currentUser } from "@/lib/account/session";
import { AccountError, accountError, checkOrigin, readBody } from "@/lib/account/http";

export const runtime = "nodejs";
async function admin() {
  const user = await currentUser();
  if (!user || user.role !== "admin") throw new AccountError("Accès administrateur requis.", 403);
  return user;
}

export async function GET() {
  try {
    await admin();
    const users = await neonUsers();
    return Response.json({ users: await Promise.all(users.map(publicAccount)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return accountError(error); }
}

export async function PATCH(request: Request) {
  try {
    checkOrigin(request);
    const actor = await admin();
    await neonAdminUpdate(actor, await readBody(request));
    return Response.json({ ok: true, message: "Compte et droits mis à jour." });
  } catch (error) { return accountError(error); }
}
