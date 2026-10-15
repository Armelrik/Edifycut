export function usingSupabase() {
  if (process.env.ACCOUNT_PROVIDER === "local") return false;
  return process.env.ACCOUNT_PROVIDER === "supabase" || !!process.env.NEXT_PUBLIC_SUPABASE_URL;
}
export function supabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Configurez l’URL et la clé publique Supabase.");
  return { url, key };
}
