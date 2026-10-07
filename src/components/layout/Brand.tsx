import Image from "next/image";

export function Brand({ compact = false }: { compact?: boolean }) {
  return <span className="flex items-center gap-3"><Image src="/edifycut-logo.svg" alt="" width={40} height={40} className="size-10 shrink-0" priority /><span><span className="block text-xl font-semibold text-zinc-950">EdifyCut</span>{!compact && <span className="block text-[11px] font-medium text-zinc-500">Votre studio vidéo</span>}</span></span>;
}
