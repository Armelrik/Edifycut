import { VideoEditorWorkflow } from "@/components/video/VideoEditorWorkflow";

export default async function EditorPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  return <VideoEditorWorkflow key={project || "new"} projectId={typeof project === "string" ? project : undefined} />;
}
