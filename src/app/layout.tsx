import type { Metadata, Viewport } from "next";
import { Alfa_Slab_One, Nunito } from "next/font/google";
import "./globals.css";

const alfaSlab = Alfa_Slab_One({
  variable: "--font-display-slab",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const nunito = Nunito({
  variable: "--font-body-round",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Gamesville — Night Carnival Arcade",
  description:
    "Step right up! Five midway mini-games under the carnival lights: swing, whack, shoot, drop and smash your way up the Carnival Cup. Subscribe via SMS — no download required.",
  keywords: [
    "arcade",
    "carnival games",
    "browser games",
    "puzzle games",
    "mobile arcade",
    "carnival cup",
  ],
  authors: [{ name: "Gamesville" }],
  openGraph: {
    title: "Gamesville — Night Carnival Arcade",
    description: "Five midway mini-games. One Carnival Cup.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#1A0C24",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${alfaSlab.variable} ${nunito.variable}`}
      data-scroll-behavior="smooth"
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}
