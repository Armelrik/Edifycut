import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabasePublicConfig } from "./config";
export async function supabaseServer() {
  const jar = await cookies(), { url, key } = supabasePublicConfig();
  return createServerClient(url, key, {
    cookieOptions: { sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: values => {
        try { for (const { name, value, options } of values) jar.set(name, value, options); }
        catch { /* Server Components cannot set cookies; proxy refreshes them first. */ }
      },
    },
  });
}
