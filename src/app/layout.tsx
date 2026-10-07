import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/layout/AppShell";
import { currentUser } from "@/lib/account/session";
import { publicAccount } from "@/lib/account/database";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "EdifyCut · Votre studio vidéo", template: "%s · EdifyCut" },
  description: "Importez vos vidéos, découpez l'essentiel et exportez un MP4 prêt à partager. Votre studio vidéo, directement dans le navigateur.",
  icons: { icon: "/edifycut-logo.svg" },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await currentUser();
  return (
    <html
      lang="fr"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head><script dangerouslySetInnerHTML={{ __html: `try{var p=JSON.parse(localStorage.getItem("edifycut-studio-preferences")||"{}");document.documentElement.dataset.theme=(p.theme==="dark"||p.theme!=="light"&&p.theme!=="dark"&&matchMedia("(prefers-color-scheme: dark)").matches)?"dark":"light"}catch{}` }} /></head>
      <body className="min-h-full text-zinc-950">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:p-3">Aller au contenu</a>
        <AppShell user={user ? publicAccount(user) : null}>{children}</AppShell>
      </body>
    </html>
  );
}
