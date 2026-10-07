import { redirect } from "next/navigation";
import { currentUser } from "@/lib/account/session";
import { database, publicAccount, type Account } from "@/lib/account/database";
import { AdminUsers } from "@/components/account/AdminUsers";

export default async function AdminPage() {
  const user = await currentUser();
  if (user?.role !== "admin") redirect("/account");
  const users = database().prepare("SELECT * FROM users ORDER BY created_at DESC").all() as Account[];
  return <AdminUsers users={users.map(publicAccount)} currentId={user.id} />;
}
