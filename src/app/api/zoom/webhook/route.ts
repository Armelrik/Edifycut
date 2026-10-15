import { accountError, AccountError } from "@/lib/account/http";
import { receiveZoom } from "@/lib/zoom/capture";
import { verifyZoomWebhook, zoomChallenge } from "@/lib/zoom/webhook";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const secret = process.env.ZM_RTMS_WEBHOOK_SECRET;
    if (!secret) throw new AccountError("Webhook Zoom non configuré.", 503);
    const raw = await request.text();
    if (raw.length > 64_000) throw new AccountError("Notification trop volumineuse.", 413);
    let data; try { data = JSON.parse(raw); } catch { throw new AccountError("Notification invalide."); }
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new AccountError("Notification invalide.");
    if (data?.event === "endpoint.url_validation") return Response.json(zoomChallenge(data.payload?.plainToken, secret));
    verifyZoomWebhook(raw, request.headers.get("x-zm-request-timestamp"), request.headers.get("x-zm-signature"), secret);
    if (["meeting.rtms_started", "meeting.rtms_stopped"].includes(data.event)) {
      if (!data.payload || typeof data.payload !== "object") throw new AccountError("Notification invalide.");
      receiveZoom(data.event, data.payload);
    }
    return Response.json({ ok: true });
  } catch (error) { return accountError(error); }
}
