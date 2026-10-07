"use client";
import { useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Video, Radio, AudioLines, Film, UserPlus, FolderOpen } from "lucide-react";
import { studioSnapshot, parseStudio, subscribeStudio } from "@/lib/studio-preferences";
import { projectSnapshot, parseProjects, subscribeProjects } from "@/lib/projects";
const workspaces = [
  { href: "/editor", label: "Éditeur vidéo", icon: Video, color: "text-indigo-600" },
  { href: "/merge", label: "Montage photo & vidéo", icon: Film, color: "text-cyan-700" },
  { href: "/audio", label: "Atelier audio", icon: AudioLines, color: "text-emerald-700" },
  { href: "/live", label: "Live Capture", icon: Radio, color: "text-red-600" },
];
export function HomeDashboard({ loggedIn = false }: { loggedIn?: boolean }) {
  const preferences = parseStudio(useSyncExternalStore(subscribeStudio, studioSnapshot, () => null));
  const projects = parseProjects(useSyncExternalStore(subscribeProjects, projectSnapshot, () => null)).slice(0, 4);
  return <div className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="eyebrow">MON STUDIO</p>{!loggedIn && <div className="flex flex-wrap items-center gap-4 text-sm"><Link href="/account" className="font-medium text-zinc-600">Se connecter</Link><Link href="/account?mode=register" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-indigo-200 bg-white px-3 font-semibold text-indigo-700"><UserPlus size={17} />Créer un compte</Link></div>}</div>
    {preferences.showBanner ? <section className="relative h-48 overflow-hidden bg-indigo-950 sm:h-60"><Image src="/edifycut-studio-banner.png" alt="Studio EdifyCut avec écran de montage, microphone et caméra" fill priority sizes="(min-width: 1024px) 1100px, 100vw" className="object-cover object-[25%_center] sm:object-center" /><div className="absolute inset-y-0 left-0 flex w-[60%] flex-col justify-center gap-3 px-4 sm:w-[46%] sm:px-8"><p className="text-xs font-medium text-cyan-200">VIDÉO · PHOTO · AUDIO</p><h1 className="break-words text-2xl font-semibold text-white sm:text-3xl">EdifyCut Studio</h1></div></section> : <h1 className="text-3xl font-semibold">EdifyCut Studio</h1>}
    <section><h2 className="text-lg font-semibold">Espaces de travail</h2><nav className="mt-3 grid gap-x-6 sm:grid-cols-2" aria-label="Créer dans le studio">{workspaces.map(item => <Link key={item.href} href={item.href} className="flex min-h-16 items-center gap-3 border-b border-zinc-200 px-1 py-3 text-sm font-medium hover:bg-white"><item.icon size={21} className={item.color} /><span className="min-w-0 flex-1">{item.label}</span><ArrowRight size={17} className="shrink-0 text-zinc-400" /></Link>)}</nav></section>
    <section className="border-t border-zinc-200 pt-5"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Projets récents</h2><Link href="/videos" className="text-sm font-medium text-indigo-700">Tous les projets</Link></div>{projects.length ? <div className="mt-4 divide-y divide-zinc-200">{projects.map(project => <Link key={project.id} href={`${project.kind === "montage" ? "/merge" : "/editor"}?project=${encodeURIComponent(project.id)}`} className="flex items-center gap-3 py-4"><span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-white text-indigo-600">{project.kind === "montage" ? <Film size={19} /> : <Video size={19} />}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{project.name}</span><span className="mt-1 block text-xs text-zinc-500">{new Date(project.updatedAt).toLocaleDateString("fr-FR")} · {project.kind === "montage" ? "Montage" : "Extrait vidéo"}</span></span><ArrowRight size={17} className="shrink-0 text-zinc-400" /></Link>)}</div> : <div className="mt-5 flex items-center gap-3 py-3 text-sm text-zinc-500"><FolderOpen size={24} className="shrink-0 text-zinc-400" />Aucun projet enregistré sur cet appareil.</div>}</section>
  </div>;
}
