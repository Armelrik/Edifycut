"use client";
import { useEffect } from "react";
export function PresenceHeartbeat({ userId }: { userId: string | null }) {
  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    const ping = () => { if (document.visibilityState === "visible") void fetch("/api/account/presence", { method: "POST", signal: controller.signal }).catch(() => {}); };
    ping(); const timer = setInterval(ping, 30_000);
    document.addEventListener("visibilitychange", ping);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", ping); };
  }, [userId]);
  return null;
}
