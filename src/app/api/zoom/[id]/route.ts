import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { currentUser } from "@/lib/account/session";
import { AccountError, accountError, checkOrigin, readBody } from "@/lib/account/http";
import { zoomCommand, zoomFile } from "@/lib/zoom/capture";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  try {
    checkOrigin(request); const user = await currentUser(); if (!user) throw new AccountError("Connexion requise.", 401);
    const { id } = await context.params, body = await readBody(request);
    return Response.json(zoomCommand(id, user.id, body.action));
  } catch (error) { return accountError(error); }
}
export async function GET(request: Request, context: Context) {
  try {
    const user = await currentUser(); if (!user) throw new AccountError("Connexion requise.", 401);
    const { id } = await context.params, file = zoomFile(id, user.id, new URL(request.url).searchParams.get("fragment"));
    const stream = createReadStream(file.path);
    request.signal.addEventListener("abort", () => stream.destroy(), { once: true });
    return new Response(Readable.toWeb(stream) as ReadableStream, { headers: { "Content-Type": file.type, "Content-Length": String(file.size), "Content-Disposition": 'attachment; filename="' + file.name + '"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return accountError(error); }
}
