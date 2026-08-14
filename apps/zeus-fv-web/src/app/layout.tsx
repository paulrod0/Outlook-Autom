import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Eficiencia — Grupo Optimus",
  description:
    "Suite interna de Grupo Optimus para diseño y comercialización de instalaciones fotovoltaicas, Comunidades Energéticas y PPA.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#081A33",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="bg-optimus-navyDeep text-slate-100 antialiased">{children}</body>
    </html>
  );
}
