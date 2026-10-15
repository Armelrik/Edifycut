import { currentUser } from "@/lib/account/session";
import { AccountError, accountError, checkOrigin, readBody } from "@/lib/account/http";
import { createZoom, listZoom, zoomAvailability } from "@/lib/zoom/capture";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const user = await currentUser(); if (!user) throw new AccountError("Connectez-vous pour accéder aux réunions enregistrées.", 401);
    return Response.json({ sessions: process.env.VERCEL ? [] : listZoom(user.id), ...zoomAvailability(), authorized: user.id === process.env.ZOOM_CAPTURE_OWNER_ID }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return accountError(error); }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request); const user = await currentUser(); if (!user) throw new AccountError("Connectez-vous pour préparer une capture Zoom.", 401);
    const body = await readBody(request);
    return Response.json(createZoom(user.id, body.meetingId, body.title, body.consent), { status: 202 });
  } catch (error) { return accountError(error); }
}
