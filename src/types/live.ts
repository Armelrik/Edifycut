export type LiveStatus = "starting" | "recording" | "pausing" | "paused" | "merging" | "completed" | "error";
export interface LiveSession {
  id: string;
  title: string;
  url: string;
  status: LiveStatus;
  createdAt: string;
  updatedAt: string;
  seconds: number;
  bytes: number;
  fragments: { name: string; bytes: number }[];
  mergedFragments: number;
  output: string | null;
  error: string | null;
}
