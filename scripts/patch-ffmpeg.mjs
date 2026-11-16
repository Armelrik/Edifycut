// Next.js 16.4 (Turbopack) refuse `new URL(classWorkerURL, import.meta.url)` dans @ffmpeg/ffmpeg 0.12 :
// l'URL dynamique ne peut pas être résolue au build. EdifyCut ne passe jamais classWorkerURL et utilise
// le worker par défaut (`new URL("./worker.js", import.meta.url)`, résolu statiquement).
// Ce script retire la branche dynamique après chaque `npm install`. Il est idempotent.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const file = join(process.cwd(), "node_modules", "@ffmpeg", "ffmpeg", "dist", "esm", "classes.js");
if (!existsSync(file)) process.exit(0);
const source = readFileSync(file, "utf8");
const marker = "/* edifycut: classWorkerURL ignoré */";
if (source.includes(marker)) process.exit(0);
const pattern = /this\.#worker = classWorkerURL \?\s*new Worker\(new URL\(classWorkerURL, import\.meta\.url\), \{\s*type: "module",\s*\}\) :/;
if (!pattern.test(source)) {
  console.warn("[patch-ffmpeg] Motif introuvable : vérifiez la compatibilité de @ffmpeg/ffmpeg avec Turbopack.");
  process.exit(0);
}
writeFileSync(file, source.replace(pattern, `this.#worker = ${marker}`));
console.log("[patch-ffmpeg] @ffmpeg/ffmpeg adapté pour Turbopack.");
