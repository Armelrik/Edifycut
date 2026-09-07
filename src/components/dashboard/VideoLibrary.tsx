import { Download, Edit3, Trash2 } from "lucide-react";
import { demoProjects } from "@/lib/video/demo-projects";
import { formatDuration } from "@/lib/video/duration";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function VideoLibrary() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Mes videos</h1>
        <p className="mt-2 text-stone-600">Projets locaux et exemples de demonstration.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {demoProjects.map((project) => (
          <Card key={project.id} className="overflow-hidden">
            <div className={`aspect-video bg-gradient-to-br ${project.accent}`} />
            <div className="space-y-4 p-4">
              <div>
                <h2 className="font-semibold">{project.title}</h2>
                <p className="text-sm text-stone-500">{project.modifiedAt}</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <span>{formatDuration(project.duration)}</span>
                <span>{project.size}</span>
                <span>{project.status}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary">Ouvrir</Button>
                <Button variant="secondary">
                  <Edit3 size={15} /> Renommer
                </Button>
                <Button variant="secondary">
                  <Download size={15} /> Exporter
                </Button>
                <Button variant="ghost" className="text-red-700">
                  <Trash2 size={15} /> Supprimer
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
