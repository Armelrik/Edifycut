import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { currentUser } from "@/lib/account/session";
import { AccountError, checkOrigin, readBody, accountError } from "@/lib/account/http";
import { controlLive, liveFile } from "@/lib/live/capture";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const user = await currentUser();
    if (!user) throw new AccountError("Connectez-vous pour gérer cette capture.", 401);
    const { id } = await context.params;
    const body = await readBody(request);
    return Response.json(await controlLive(id, user.id, body.action));
  } catch (error) { return accountError(error); }
}
export async function GET(request: Request, context: Context) {
  try {
    const user = await currentUser();
    if (!user) throw new AccountError("Connectez-vous pour télécharger cette capture.", 401);
    const { id } = await context.params;
    const file = liveFile(id, user.id, new URL(request.url).searchParams.get("fragment"));
    const source = createReadStream(file.path);
    const abort = () => { source.destroy(); };
    request.signal.addEventListener("abort", abort, { once: true });
    source.once("close", () => request.signal.removeEventListener("abort", abort));
    if (request.signal.aborted) abort();
    return new Response(Readable.toWeb(source) as ReadableStream<Uint8Array>, { headers: {
      "Content-Type": file.name.endsWith(".mp4") ? "video/mp4" : "video/mp2t",
      "Content-Length": String(file.bytes), "Content-Disposition": `attachment; filename="edifycut-${file.name}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return accountError(error); }
}
