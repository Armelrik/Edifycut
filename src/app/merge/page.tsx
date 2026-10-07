import { MontageWorkspace } from "@/components/montage/MontageStudio";
export const metadata = { title: "Montage photo et vidéo" };
export default async function MergePage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  return <MontageWorkspace projectId={typeof project === "string" ? project : undefined} />;
}
