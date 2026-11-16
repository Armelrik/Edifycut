import "server-only";
import { randomUUID } from "node:crypto";
import { query } from "@/lib/neon/database";
import { cpus, freemem, totalmem } from "node:os";
import { readdir, lstat, statfs } from "node:fs/promises";
import { join } from "node:path";
import { activeUsers } from "@/lib/account/presence";
import type { UsageSample, UsageStatistics } from "@/types/statistics";
type Cpu = { idle: number; total: number };
type State = { instanceId?: string; cpu?: Cpu; last?: UsageSample; storage?: UsageStatistics["storage"]; pending?: Promise<UsageStatistics["storage"]> };
const globalState = globalThis as typeof globalThis & { edifycutMetrics?: State };
const state = globalState.edifycutMetrics ??= {};
state.instanceId ??= randomUUID();
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
  const now = Date.now();
  if (!state.last || now - state.last.time >= 10_000) {
    const counters = cpuCounters(), elapsed = state.cpu ? counters.total - state.cpu.total : 0;
    const cpu = state.cpu && elapsed > 0 ? Math.max(0, Math.min(100, (1 - (counters.idle - state.cpu.idle) / elapsed) * 100)) : null;
    state.cpu = counters;
    const sample: UsageSample = { time: now, cpu, rss: process.memoryUsage.rss(), memoryUsed: totalmem() - freemem(), memoryTotal: totalmem(), online: await activeUsers() };
    await query("DELETE FROM edifycut.usage_samples WHERE time < $1", [now - 24 * 3600_000]);
    await query(`INSERT INTO edifycut.usage_samples(time, instance_id, cpu, rss, memory_used, memory_total, online) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (time, instance_id) DO UPDATE SET cpu = excluded.cpu, rss = excluded.rss, memory_used = excluded.memory_used, memory_total = excluded.memory_total, online = excluded.online`,
      [sample.time, state.instanceId, sample.cpu, sample.rss, sample.memoryUsed, sample.memoryTotal, sample.online]);
    state.last = sample;
  }
  const [[accounts], history] = await Promise.all([
    query<{ total: number; enabled: number }>("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE NOT disabled)::int AS enabled FROM edifycut.profiles"),
    query<UsageSample>(`SELECT time, cpu, rss, memory_used AS "memoryUsed", memory_total AS "memoryTotal", online FROM edifycut.usage_samples
      WHERE instance_id = $1 AND time >= $2 ORDER BY time LIMIT 1000`, [state.instanceId, now - 3600_000]),
  ]);
  return { sample: { ...state.last, online: await activeUsers() }, history, accounts: accounts.total, enabledAccounts: accounts.enabled, cores: cpus().length, uptime: process.uptime(), storage: await storage(), scope: process.env.VERCEL ? "instance" : "server" };
}
