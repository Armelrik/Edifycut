import "server-only";
import { createNeonAuth } from "@neon/auth/next/server";

export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  // Cache signé des données de session : 60 s au plus de délai après une révocation.
  // Le rôle et l’état du compte sont relus dans edifycut.profiles à chaque requête.
  cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET!, sessionDataTtl: 60 },
});
