import { AccountPanel } from "@/components/account/AccountPanel";
import { currentUser } from "@/lib/account/session";
import { publicAccount } from "@/lib/account/database";
import { usingSupabase } from "@/lib/supabase/config";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ mode?: string; confirmed?: string; confirmation?: string }> }) {
  const user = await currentUser();
  const params = await searchParams;
  const mode = params.mode === "register" ? "register" : "login";
  return <AccountPanel initialNotice={params.confirmed === "1" ? "Votre adresse e-mail est confirmée." : ""} initialError={params.confirmation === "invalid" ? "Lien de confirmation invalide ou expiré. Demandez un nouveau lien." : ""} cloud={usingSupabase()} key={`${user?.id ?? "guest"}-${mode}`} initialMode={mode} user={user ? await publicAccount(user) : null} />;
}
