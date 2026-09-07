import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function SettingsPanel() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Parametres</h1>
        <p className="mt-2 text-stone-600">Preferences par defaut pour vos exports EdifyCut.</p>
      </div>

      <Card className="space-y-6 p-5">
        <div>
          <h2 className="font-semibold">Preferences d&apos;export</h2>
          <p className="text-sm text-stone-500">Ces valeurs preparent les nouveaux projets.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm font-medium">
            Qualite par defaut
            <select className="h-10 w-full rounded-md border border-stone-200 bg-white px-3 text-sm">
              <option>720p</option>
              <option>1080p</option>
              <option>480p</option>
              <option>Original</option>
            </select>
          </label>
          <label className="space-y-2 text-sm font-medium">
            Vitesse par defaut
            <select className="h-10 w-full rounded-md border border-stone-200 bg-white px-3 text-sm">
              <option>1x</option>
              <option>1.25x</option>
              <option>1.5x</option>
            </select>
          </label>
          <label className="space-y-2 text-sm font-medium">
            Format
            <Input value="MP4" readOnly />
          </label>
          <label className="space-y-2 text-sm font-medium">
            Preset par defaut
            <select className="h-10 w-full rounded-md border border-stone-200 bg-white px-3 text-sm">
              <option>WhatsApp</option>
              <option>Original</option>
              <option>Rapide</option>
              <option>Compact</option>
            </select>
          </label>
        </div>
        <div className="space-y-3 border-t border-stone-200 pt-5">
          <label className="flex items-center justify-between gap-4 text-sm font-medium">
            Conserver les fichiers temporaires
            <input type="checkbox" className="size-5 accent-amber-700" />
          </label>
          <label className="flex items-center justify-between gap-4 text-sm font-medium">
            Supprimer automatiquement les fichiers apres export
            <input type="checkbox" defaultChecked className="size-5 accent-amber-700" />
          </label>
        </div>
      </Card>
    </div>
  );
}
