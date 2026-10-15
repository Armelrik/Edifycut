import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabasePublicConfig } from "./config";
export function supabaseAdmin() {
  const { url } = supabasePublicConfig();
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Configurez la clé serveur Supabase (jamais NEXT_PUBLIC).");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (url, options) => fetch(url, { ...options, cache: "no-store" }) } });
}
export function assertDatabase(error: { message: string } | null) {
  if (error) { console.error("[supabase] Database request failed:", error.message); throw new Error("Le stockage des comptes est momentanément indisponible."); }
}
