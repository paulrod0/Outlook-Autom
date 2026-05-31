"use client";

import type { PanelModel } from "./panelLayout";
import { DEFAULT_PANELS } from "./panelLayout";

/**
 * Carga el catálogo de paneles desde /data/panels.json.
 * Cachea el resultado en memoria para no repetir la fetch.
 * Si la fetch falla, devuelve DEFAULT_PANELS (fallback offline).
 */

export type PanelCatalogEntry = PanelModel & {
  category?: "monofacial" | "bifacial";
};

let cache: PanelCatalogEntry[] | null = null;
let pending: Promise<PanelCatalogEntry[]> | null = null;

export async function loadPanelCatalog(): Promise<PanelCatalogEntry[]> {
  if (cache) return cache;
  if (pending) return pending;
  pending = (async () => {
    try {
      const res = await fetch("/data/panels.json", { cache: "force-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { panels: PanelCatalogEntry[] };
      const list = Array.isArray(data?.panels) && data.panels.length > 0
        ? data.panels
        : DEFAULT_PANELS;
      cache = list;
      return list;
    } catch {
      cache = DEFAULT_PANELS;
      return DEFAULT_PANELS;
    } finally {
      pending = null;
    }
  })();
  return pending;
}

/** Catálogo ya cargado (síncrono). null si aún no se ha llamado a loadPanelCatalog. */
export function cachedPanelCatalog(): PanelCatalogEntry[] | null {
  return cache;
}

/** Agrupa por fabricante para el selector. */
export function groupByManufacturer(
  panels: PanelCatalogEntry[],
): Array<{ manufacturer: string; panels: PanelCatalogEntry[] }> {
  const byMfr = new Map<string, PanelCatalogEntry[]>();
  for (const p of panels) {
    if (!byMfr.has(p.manufacturer)) byMfr.set(p.manufacturer, []);
    byMfr.get(p.manufacturer)!.push(p);
  }
  return Array.from(byMfr.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([manufacturer, panels]) => ({
      manufacturer,
      panels: panels.sort((a, b) => b.peakWp - a.peakWp),
    }));
}

export function panelKey(p: PanelModel): string {
  return `${p.manufacturer}|${p.model}`;
}

export function findPanelByKey(
  list: PanelCatalogEntry[],
  key: string,
): PanelCatalogEntry | undefined {
  return list.find((p) => panelKey(p) === key);
}
