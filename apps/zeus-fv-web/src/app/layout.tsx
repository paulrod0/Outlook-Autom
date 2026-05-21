import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Zeus FV — Diseñador de instalaciones fotovoltaicas",
  description:
    "Herramienta interna de Zeus Energía para el diseño, dimensionado y oferta de instalaciones fotovoltaicas y Comunidades Energéticas.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="bg-zeus-dark text-slate-100 antialiased">{children}</body>
    </html>
  );
}
