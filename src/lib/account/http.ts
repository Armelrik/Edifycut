export class AccountError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  const host = request.headers.get("host");
  if (host) url.host = host;
  if (origin !== url.origin) throw new AccountError("Origine de la requête refusée.", 403);
}

export async function readBody(request: Request) {
  const text = await request.text();
  if (text.length > 8192) throw new AccountError("Requête trop volumineuse.", 413);
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw new AccountError("Requête invalide."); }
}

export function validPassword(value: unknown): string {
  if (typeof value !== "string" || value.length < 12 || Buffer.byteLength(value, "utf8") > 72) {
    throw new AccountError("Utilisez au moins 12 caractères (72 octets maximum) pour le mot de passe.");
  }
  return value;
}

export function validName(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 80) throw new AccountError("Indiquez un nom de 1 à 80 caractères.");
  return value.trim();
}

export function accountError(error: unknown) {
  if (error instanceof AccountError) return Response.json({ error: error.message }, { status: error.status });
  console.error("[account]", error instanceof Error ? error.message : "Erreur inconnue");
  return Response.json({ error: "Le service de compte est momentanément indisponible." }, { status: 500 });
}
