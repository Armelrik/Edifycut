import { createHmac, timingSafeEqual } from "node:crypto";
import { AccountError } from "@/lib/account/http";
export function verifyZoomWebhook(raw: string, timestamp: string | null, signature: string | null, secret: string) {
  if (!timestamp || !signature || !/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) throw new AccountError("Notification Zoom expirée ou non signée.", 401);
  const expected = "v0=" + createHmac("sha256", secret).update("v0:" + timestamp + ":" + raw).digest("hex");
  const actualBytes = Buffer.from(signature), expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) throw new AccountError("Signature Zoom invalide.", 401);
}
export function zoomChallenge(plainToken: unknown, secret: string) {
  if (typeof plainToken !== "string" || !plainToken || plainToken.length > 1024) throw new AccountError("Validation Zoom invalide.");
  return { plainToken, encryptedToken: createHmac("sha256", secret).update(plainToken).digest("hex") };
}
