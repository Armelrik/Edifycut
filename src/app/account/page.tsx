import { AccountPanel } from "@/components/account/AccountPanel";
import { currentUser } from "@/lib/account/session";
import { publicAccount } from "@/lib/account/database";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const user = await currentUser();
  const mode = (await searchParams).mode === "register" ? "register" : "login";
  return <AccountPanel key={`${user?.id ?? "guest"}-${mode}`} initialMode={mode} user={user ? publicAccount(user) : null} />;
}
