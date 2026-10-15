import { ResetPassword } from "@/components/account/ResetPassword";
import { usingSupabase } from "@/lib/supabase/config";
export const metadata = { title: "Réinitialiser le mot de passe", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token_hash?: string }> }) {
  const value = (await searchParams).token_hash;
  return <ResetPassword enabled={usingSupabase()} tokenHash={usingSupabase() && typeof value === "string" && value.length <= 2048 ? value : undefined} />;
}
