import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function InfoPage({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <article className="mx-auto max-w-3xl"><Link href="/" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-indigo-700"><ArrowLeft size={16} /> Retour au studio</Link><p className="eyebrow mt-8">EDIFYCUT</p><h1 className="mt-3 text-3xl font-semibold">{title}</h1><p className="mt-4 text-lg leading-7 text-zinc-500">{description}</p><div className="info-copy mt-8 border-t border-zinc-200 pt-4">{children}</div></article>;
}
