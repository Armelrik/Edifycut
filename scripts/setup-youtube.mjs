import { spawnSync } from "node:child_process";
import { join } from "node:path";

const directory = join(process.cwd(), ".tools", "yt-dlp");
const python = process.env.PYTHON_PATH || (process.platform === "win32" ? "python" : "python3");
const steps = [
  [python, ["-m", "venv", directory]],
  [join(directory, process.platform === "win32" ? "Scripts/python.exe" : "bin/python"),
    ["-m", "pip", "install", "--upgrade", "yt-dlp[default]"]],
];
for (const [command, args] of steps) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error || result.status !== 0) {
    console.error(result.error?.message || "Installation de yt-dlp impossible.");
    process.exit(result.status || 1);
  }
}
