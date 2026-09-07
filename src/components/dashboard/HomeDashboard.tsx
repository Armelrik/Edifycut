import Link from "next/link";
import { Upload, Video } from "lucide-react";
import { demoProjects } from "@/lib/video/demo-projects";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProjectCard } from "./ProjectCard";

export function HomeDashboard() {
  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <section className="grid gap-6 lg:grid-cols-[1.12fr_0.88fr] lg:items-stretch">
        <div className="flex min-h-[360px] flex-col justify-center rounded-lg border border-stone-200 bg-white p-6 shadow-sm sm:p-8 lg:p-10">
          <div className="mb-5 flex size-12 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
            <Video size={24} />
          </div>
          <h1 className="max-w-3xl text-3xl font-bold tracking-tight text-stone-950 sm:text-4xl lg:text-5xl">
            Transformez vos enseignements en quelques minutes.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-stone-600 sm:text-lg">
            Coupez, accelerez, compressez et preparez vos videos pour les partager facilement.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/editor">
              <Button className="w-full sm:w-auto">
                <Upload size={18} /> Importer une video
              </Button>
            </Link>
          </div>
        </div>

        <Link href="/editor" className="block">
          <Card className="flex min-h-[360px] flex-col items-center justify-center border-dashed bg-stone-100/70 p-6 text-center transition hover:border-amber-400 hover:bg-amber-50/60">
            <div className="flex size-16 items-center justify-center rounded-full bg-white text-amber-800 shadow-sm">
              <Upload size={28} />
            </div>
            <h2 className="mt-6 text-xl font-bold">Deposez votre video ici</h2>
            <p className="mt-2 text-sm text-stone-500">MP4, MOV, WebM - jusqu&apos;a 2 Go</p>
          </Card>
        </Link>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Projets recents</h2>
            <p className="text-sm text-stone-500">Donnees de demonstration pour visualiser le dashboard.</p>
          </div>
          <Link href="/videos" className="text-sm font-semibold text-amber-800 hover:text-amber-900">
            Voir mes videos
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {demoProjects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      </section>
    </div>
  );
}
