import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { usingSupabase, supabasePublicConfig } from "@/lib/supabase/config";
export async function proxy(request: NextRequest) {
  if (!usingSupabase()) return NextResponse.next();
  const { url, key } = supabasePublicConfig();
  let response = NextResponse.next({ request });
  const client = createServerClient(url, key, { cookies: {
    getAll: () => request.cookies.getAll(),
    setAll: values => {
      for (const { name, value } of values) request.cookies.set(name, value);
      response = NextResponse.next({ request });
      for (const { name, value, options } of values) response.cookies.set(name, value, options);
    },
  } });
  await client.auth.getUser();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = {
  matcher: ["/((?!_next/|ffmpeg-core/|api/billing/paypal/webhook|api/zoom/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|wasm|js|css|map)$).*)"],
};
