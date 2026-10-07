"use client";
import { useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Video,
  Radio,
  AudioLines,
  Film,
  UserPlus,
  FolderOpen,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import {
  studioSnapshot,
  parseStudio,
  subscribeStudio,
} from "@/lib/studio-preferences";
import {
  projectSnapshot,
  parseProjects,
  subscribeProjects,
} from "@/lib/projects";
const workspaces = [
  {
    href: "/editor",
    label: "Éditeur vidéo",
    description: "Coupes précises, vitesse et presets.",
    icon: Video,
    color: "text-indigo-600",
  },
  {
    href: "/merge",
    label: "Montage photo, vidéo & audio",
    description: "Une timeline pour réunir vos séquences.",
    icon: Film,
    color: "text-cyan-700",
  },
  {
    href: "/audio",
    label: "Atelier audio",
    description: "Enregistrement, fondus et mixage.",
    icon: AudioLines,
    color: "text-emerald-700",
  },
  {
    href: "/live",
    label: "Live Capture",
    description: "Vos directs, capturés en fragments.",
    icon: Radio,
    color: "text-red-600",
  },
];
export function HomeDashboard({ loggedIn = false }: { loggedIn?: boolean }) {
  const preferences = parseStudio(
    useSyncExternalStore(subscribeStudio, studioSnapshot, () => null),
  );
  const projects = parseProjects(
    useSyncExternalStore(subscribeProjects, projectSnapshot, () => null),
  ).slice(0, 4);
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="text-4xl font-semiboldflex flex-wrap items-center justify-between gap-3">
        <p className="eyebrow">MON STUDIO</p>
        {!loggedIn && (
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <Link href="/account" className="font-medium text-zinc-600">
              Se connecter
            </Link>
            <Link
              href="/account?mode=register"
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-indigo-200 bg-white px-3 font-semibold text-indigo-700"
            >
              <UserPlus size={17} />
              Créer un compte
            </Link>
          </div>
        )}
      </div>
      {preferences.showBanner ? (
        <section className="home-banner relative min-h-64 overflow-hidden bg-indigo-950 sm:min-h-72">
          <Image
            src="/edifycut-studio-banner.png"
            alt="Studio EdifyCut avec écran de montage, microphone et caméra"
            fill
            priority
            sizes="(min-width: 1024px) 1100px, 100vw"
            className="object-cover object-[20%_center] sm:object-center"
          />
          <div className="absolute inset-0 bg-black/35" />
          <div className="relative flex min-h-64 max-w-lg flex-col justify-center gap-3 px-5 py-6 sm:min-h-72 sm:px-8">
            <p className="text-xs font-medium text-cyan-200">
              VOTRE ESPACE DE CRÉATION
            </p>
            <h1 className="text-3xl font-semibold text-white">
              EdifyCut Studio
            </h1>
            <p className="max-w-sm text-sm leading-6 text-white/90">
              De la première coupe au dernier fondu. Donnez un nouveau rythme à
              vos vidéos, vos photos et votre audio.
            </p>
            <Link
              href="/merge"
              className="mt-1 inline-flex min-h-11 w-fit items-center gap-2 rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Ouvrir le montage
              <ArrowRight size={17} />
            </Link>
          </div>
        </section>
      ) : (
        <div>
          <h1 className="text-3xl font-semibold">EdifyCut Studio</h1>
          <p className="mt-3 text-sm text-zinc-500">
            Votre espace vidéo, photo et audio.
          </p>
        </div>
      )}
      <section>
        <h2 className="text-lg font-semibold">Espaces de travail</h2>
        <nav
          className="mt-3 grid gap-x-6 sm:grid-cols-2"
          aria-label="Créer dans le studio"
        >
          {workspaces.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="workspace-link flex min-h-20 items-center gap-4 border-b border-zinc-200 px-2 py-4 text-sm font-medium hover:bg-white"
            >
              <item.icon size={21} className={item.color} />
              <span className="min-w-0 flex-1">
                <span className="block">{item.label}</span>
                <span className="mt-1 block text-xs font-normal leading-5 text-zinc-500">
                  {item.description}
                </span>
              </span>
              <ArrowRight size={17} className="shrink-0 text-zinc-400" />
            </Link>
          ))}
        </nav>
      </section>
      <section className="border-t border-zinc-200 pt-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Projets récents</h2>
          <Link href="/videos" className="text-sm font-medium text-indigo-700">
            Tous les projets
          </Link>
        </div>
        {projects.length ? (
          <div className="mt-4 divide-y divide-zinc-200">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`${project.kind === "montage" ? "/merge" : "/editor"}?project=${encodeURIComponent(project.id)}`}
                className="flex items-center gap-3 py-4"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-white text-indigo-600">
                  {project.kind === "montage" ? (
                    <Film size={19} />
                  ) : (
                    <Video size={19} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {project.name}
                  </span>
                  <span className="mt-1 block text-xs text-zinc-500">
                    {new Date(project.updatedAt).toLocaleDateString("fr-FR")} ·{" "}
                    {project.kind === "montage" ? "Montage" : "Extrait vidéo"}
                  </span>
                </span>
                <ArrowRight size={17} className="shrink-0 text-zinc-400" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-5 flex items-center gap-3 py-3 text-sm text-zinc-500">
            <FolderOpen size={24} className="shrink-0 text-zinc-400" />
            Aucun projet enregistré sur cet appareil.
          </div>
        )}
      </section>
      <section className="grid gap-6 border-t border-zinc-200 py-6 sm:grid-cols-2">
        <div>
          <p className="eyebrow">VOTRE CONTENU</p>
          <h2 className="mt-3 text-lg font-semibold">Des originaux intacts</h2>
          <p className="mt-3 text-sm leading-6 text-zinc-500">
            Les fichiers locaux restent sur votre appareil. Vos coupes et
            réglages sont enregistrés séparément, sans modifier les sources.
          </p>
          <Link
            href="/privacy"
            className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-indigo-700"
          >
            <ShieldCheck size={17} />
            Confidentialité
            <ArrowRight size={15} />
          </Link>
        </div>
        <div>
          <p className="eyebrow">À VOTRE RYTHME</p>
          <h2 className="mt-3 text-lg font-semibold">
            Un studio qui vous ressemble
          </h2>
          <p className="mt-3 text-sm leading-6 text-zinc-500">
            Retrouvez vos projets récents, votre palette et vos réglages de
            montage. Choisissez un cadre paysage, portrait ou carré pour votre
            prochaine création.
          </p>
          <Link
            href="/settings"
            className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-indigo-700"
          >
            <SlidersHorizontal size={17} />
            Mes préférences
            <ArrowRight size={15} />
          </Link>
        </div>
      </section>
    </div>
  );
}
