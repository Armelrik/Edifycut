export type ZoomCaptureStatus = "waiting" | "starting" | "recording" | "paused" | "merging" | "completed" | "error";
export interface ZoomCapture {
  id: string; owner: string; meetingId: string; title: string; status: ZoomCaptureStatus;
  createdAt: string; updatedAt: string; seconds: number; bytes: number;
  streamId?: string; fragments: { name: string; bytes: number }[];
  mergedFragments: number; output: string | null; error: string | null;
}
