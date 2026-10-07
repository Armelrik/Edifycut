export interface UsageSample {
  time: number; cpu: number | null; rss: number; memoryUsed: number; memoryTotal: number; online: number;
}
export interface UsageStatistics {
  sample: UsageSample; history: UsageSample[]; accounts: number; enabledAccounts: number;
  cores: number; uptime: number; storage: { bytes: number; free: number | null; total: number | null; measuredAt: number };
}
