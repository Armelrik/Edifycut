import { NextResponse } from "next/server";
import { usingSupabase } from "@/lib/supabase/config";
import { supabaseServer } from "@/lib/supabase/server";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams, token = params.get("token_hash");
  if (usingSupabase() && token && params.get("type") === "email") {
    const client = await supabaseServer();
    const { error } = await client.auth.verifyOtp({ token_hash: token, type: "email" });
    if (!error) return NextResponse.redirect(new URL("/account?confirmed=1", request.url));
  }
  return NextResponse.redirect(new URL("/account?confirmation=invalid", request.url));
}
