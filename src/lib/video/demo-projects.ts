import { DemoProject } from "@/types/video";

export const demoProjects: DemoProject[] = [
  {
    id: "grace",
    title: "Comprendre la grace de Dieu",
    duration: 55 * 60 + 20,
    modifiedAt: "Donnees demo - modifie hier",
    size: "84 MB",
    status: "Demo",
    accent: "from-amber-200 via-stone-200 to-zinc-300",
  },
  {
    id: "foi",
    title: "Marcher dans la foi",
    duration: 42 * 60 + 12,
    modifiedAt: "Donnees demo - 3 sept. 2026",
    size: "72 MB",
    status: "Demo",
    accent: "from-orange-200 via-rose-100 to-stone-300",
  },
  {
    id: "priere",
    title: "La puissance de la priere",
    duration: 61 * 60 + 4,
    modifiedAt: "Donnees demo - 30 aout 2026",
    size: "96 MB",
    status: "Demo",
    accent: "from-teal-100 via-stone-200 to-amber-100",
  },
];
