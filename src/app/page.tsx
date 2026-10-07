import { HomeDashboard } from "@/components/dashboard/HomeDashboard";
import { currentUser } from "@/lib/account/session";

export default async function Home() {
  return <HomeDashboard loggedIn={!!await currentUser()} />;
}
