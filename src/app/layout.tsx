import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const body = Figtree({ subsets: ["latin"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Voisino — la vie de votre ville, en vidéo", template: "%s · Voisino" },
  description:
    "Voisino réunit les vidéos des habitants, l'actualité locale, les commerces et les sorties de votre ville dans un flux vidéo hyperlocal.",
  applicationName: "Voisino",
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  openGraph: { siteName: "Voisino", locale: "fr_FR", type: "website" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf8f4" },
    { media: "(prefers-color-scheme: dark)", color: "#100e0c" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${display.variable} ${body.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
