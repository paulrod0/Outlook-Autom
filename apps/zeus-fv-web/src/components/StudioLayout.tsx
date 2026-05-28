"use client";

import Link from "next/link";
import { useEffect } from "react";
import { MapWorkspace } from "@/components/MapWorkspace";
import { ProjectPanel } from "@/components/ProjectPanel";
import { BRAND } from "@/lib/branding";
import type { ProductType } from "@/lib/store";
import { setState } from "@/lib/store";

/**
 * Layout común a los tres flujos comerciales (FV, CE, PPA).
 *
 * Cada ruta envuelve este componente y le pasa su `productType`. Se
 * almacena en el estado global para que `ProjectPanel` ajuste qué
 * secciones muestra y qué generador de PDF utiliza.
 */
export function StudioLayout({
  productType,
  productName,
}: {
  productType: ProductType;
  productName: string;
}) {
  useEffect(() => {
    setState({ productType });
  }, [productType]);

  return (
    <main className="flex min-h-[100dvh] flex-col md:grid md:h-screen md:grid-cols-[1fr_380px] md:grid-rows-[auto_1fr]">
      <header className="col-span-2 flex items-center justify-between border-b border-white/10 bg-optimus-navyDeep px-4 py-2 text-xs">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 text-slate-300 transition hover:text-optimus-cyan"
            title="Volver al selector"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-optimus-cyan font-bold text-optimus-navyDeep">
              G
            </span>
            <span className="font-semibold uppercase tracking-wider">
              {BRAND.appName}
            </span>
          </Link>
          <span className="text-slate-500">/</span>
          <span className="font-medium text-slate-200">{productName}</span>
        </div>
        <span className="hidden text-slate-500 sm:block">
          {BRAND.companyName} · {BRAND.tagline}
        </span>
      </header>

      <div className="relative h-[60vh] min-h-[320px] md:h-auto md:min-h-0">
        <MapWorkspace />
      </div>
      <ProjectPanel />
    </main>
  );
}
