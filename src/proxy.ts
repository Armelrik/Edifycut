import { auth } from "@/lib/neon/auth";

// Le reste de l’application est public : chaque page ou route vérifie elle-même la session.
// Ce proxy rafraîchit la session Neon Auth et redirige les visiteurs non connectés hors de l’administration.
export default auth.middleware({ loginUrl: "/account" });

export const config = {
  matcher: ["/admin/:path*"],
};
