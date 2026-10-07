import "server-only";
import { cpus, freemem, totalmem } from "node:os";
import { readdir, lstat, statfs } from "node:fs/promises";
import { join } from "node:path";
import { database } from "@/lib/account/database";
import { activeUsers } from "@/lib/account/presence";
import type { UsageSample, UsageStatistics } from "@/types/statistics";
type Cpu = { idle: number; total: number };
type State = { cpu?: Cpu; last?: UsageSample; storage?: UsageStatistics["storage"]; pending?: Promise<UsageStatistics["storage"]> };
const globalState = globalThis as typeof globalThis & { edifycutMetrics?: State };
const state = globalState.edifycutMetrics ??= {};
function cpuCounters(): Cpu {
  return cpus().reduce((sum, cpu) => ({ idle: sum.idle + cpu.times.idle, total: sum.total + Object.values(cpu.times).reduce((a, b) => a + b, 0) }), { idle: 0, total: 0 });
}
async function directorySize(directory: string): Promise<number> {
  let total = 0;
  try {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) total += await directorySize(path);
      else if (entry.isFile()) { try { total += (await lstat(path)).size; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } }
    }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  return total;
}
async function storage() {
  if (state.storage && Date.now() - state.storage.measuredAt < 30_000) return state.storage;
  if (!state.pending) state.pending = (async () => {
    const bytes = await directorySize(join(process.cwd(), ".data"));
    let free: number | null = null, total: number | null = null;
    try { const disk = await statfs(process.cwd()); free = disk.bavail * disk.bsize; total = disk.blocks * disk.bsize; } catch { /* Some hosts do not expose filesystem capacity. */ }
    return state.storage = { bytes, free, total, measuredAt: Date.now() };
  })().finally(() => { state.pending = undefined; });
  return state.pending;
}
export async function usageStatistics(): Promise<UsageStatistics> {
  const db = database();
  db.exec("CREATE TABLE IF NOT EXISTS usage_samples (time INTEGER PRIMARY KEY, cpu REAL, rss INTEGER NOT NULL, memory_used INTEGER NOT NULL, memory_total INTEGER NOT NULL, online INTEGER NOT NULL)");
  const now = Date.now();
  if (!state.last || now - state.last.time >= 10_000) {
    const counters = cpuCounters(), elapsed = state.cpu ? counters.total - state.cpu.total : 0;
    const cpu = state.cpu && elapsed > 0 ? Math.max(0, Math.min(100, (1 - (counters.idle - state.cpu.idle) / elapsed) * 100)) : null;
    state.cpu = counters;
    const sample: UsageSample = { time: now, cpu, rss: process.memoryUsage.rss(), memoryUsed: totalmem() - freemem(), memoryTotal: totalmem(), online: activeUsers() };
    db.transaction(() => {
      db.prepare("DELETE FROM usage_samples WHERE time < ?").run(now - 24 * 3600_000);
      db.prepare("INSERT OR REPLACE INTO usage_samples VALUES (?, ?, ?, ?, ?, ?)").run(sample.time, sample.cpu, sample.rss, sample.memoryUsed, sample.memoryTotal, sample.online);
    })();
    state.last = sample;
  }
  const accounts = db.prepare("SELECT COUNT(*) AS total, COALESCE(SUM(disabled = 0), 0) AS enabled FROM users").get() as { total: number; enabled: number };
  const history = db.prepare("SELECT time, cpu, rss, memory_used AS memoryUsed, memory_total AS memoryTotal, online FROM usage_samples WHERE time >= ? ORDER BY time").all(now - 3600_000) as UsageSample[];
  return { sample: { ...state.last, online: activeUsers() }, history, accounts: accounts.total, enabledAccounts: accounts.enabled, cores: cpus().length, uptime: process.uptime(), storage: await storage() };
}
