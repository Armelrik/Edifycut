import Link from "next/link";
import { ArrowRight, Clock3 } from "lucide-react";
import { DemoProject } from "@/types/video";
import { formatDuration } from "@/lib/video/duration";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function ProjectCard({ project }: { project: DemoProject }) {
  return (
    <Card className="overflow-hidden">
      <div className={`aspect-video bg-gradient-to-br ${project.accent} p-4`}>
        <div className="flex h-full flex-col justify-between rounded-md border border-white/55 bg-white/35 p-3 backdrop-blur-sm">
          <span className="w-fit rounded bg-white/75 px-2 py-1 text-xs font-semibold text-stone-700">
            {project.status}
          </span>
          <div className="h-10 w-20 rounded bg-stone-950/80" />
        </div>
      </div>
      <div className="space-y-4 p-4">
        <div>
          <h3 className="line-clamp-2 font-semibold text-stone-950">{project.title}</h3>
          <p className="mt-1 text-sm text-stone-500">{project.modifiedAt}</p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-sm text-stone-600">
            <Clock3 size={15} />
            {formatDuration(project.duration)}
          </span>
          <Link href="/editor">
            <Button variant="secondary" className="h-9">
              Ouvrir
              <ArrowRight size={15} />
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  );
}
