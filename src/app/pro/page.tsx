import { currentUser } from "@/lib/account/session";
import { publicAccount } from "@/lib/account/database";
import { paypalConfigured, paypalSandbox } from "@/lib/billing/paypal";
import { ProOffer } from "@/components/account/ProOffer";
export const metadata = { title: "EdifyCut Pro" };
export default async function ProPage() {
  const user = await currentUser();
  return <ProOffer user={user ? publicAccount(user) : null} configured={paypalConfigured()} sandbox={paypalSandbox()} />;
}
