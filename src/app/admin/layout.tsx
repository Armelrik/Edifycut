import { redirect } from "next/navigation";
import { currentUser } from "@/lib/account/session";
import { AdminNavigation } from "@/components/account/AdminNavigation";
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if ((await currentUser())?.role !== "admin") redirect("/account");
  return <><AdminNavigation />{children}</>;
}
