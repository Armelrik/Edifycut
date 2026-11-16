import { redirect } from "next/navigation";
import { neonUsers } from "@/lib/neon/accounts";
import { currentUser } from "@/lib/account/session";
import { publicAccount } from "@/lib/account/database";
import { AdminUsers } from "@/components/account/AdminUsers";

export default async function AdminPage() {
  const user = await currentUser();
  if (user?.role !== "admin") redirect("/account");
  const users = await neonUsers();
  return <AdminUsers users={await Promise.all(users.map(publicAccount))} currentId={user.id} />;
}
