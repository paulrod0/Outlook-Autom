/**
 * Persistencia de proyectos.
 *
 * Implementación actual: localStorage del navegador. Estructura idéntica
 * al modelo planteado en docs/ARQUITECTURA.md §5 para que la migración a
 * Supabase consista únicamente en cambiar este módulo por uno que llame
 * al cliente Supabase.
 */

import type { CommunityMember } from "./community";
import type { LayoutResult, PanelModel } from "./panelLayout";
import { DEFAULT_PANELS } from "./panelLayout";
import { getState, setState } from "./store";

const STORAGE_KEY = "zeus-fv:projects:v1";

export type ProjectSnapshot = {
  id: string;
  name: string;
  savedAt: string;
  data: {
    clientName: string;
    reference: string | null;
    address: string | null;
    centroid: { lat: number; lon: number } | null;
    parcelAreaM2: number | null;
    parcelGeometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
    panelKey: string; // "manufacturer|model"
    tiltDeg: number;
    azimuthDeg: number;
    edgeMarginM: number;
    ceLimit: boolean;
    communityMembers: CommunityMember[];
    layout: LayoutResult | null;
    pvgis:
      | { yearlyKwh: number; specificYield: number; monthlyKwh: number[] }
      | null;
  };
};

function read(): ProjectSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ProjectSnapshot[];
  } catch {
    return [];
  }
}

function write(items: ProjectSnapshot[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function listProjects(): ProjectSnapshot[] {
  return read().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function saveCurrentProject(name?: string): ProjectSnapshot {
  const s = getState();
  const displayName =
    name?.trim() || s.clientName.trim() || s.reference || "Sin título";

  const snapshot: ProjectSnapshot = {
    id: uid(),
    name: displayName,
    savedAt: new Date().toISOString(),
    data: {
      clientName: s.clientName,
      reference: s.reference,
      address: s.address,
      centroid: s.centroid,
      parcelAreaM2: s.parcelAreaM2,
      parcelGeometry: s.parcelGeometry,
      panelKey: `${s.panel.manufacturer}|${s.panel.model}`,
      tiltDeg: s.tiltDeg,
      azimuthDeg: s.azimuthDeg,
      edgeMarginM: s.edgeMarginM,
      ceLimit: s.ceLimit,
      communityMembers: s.communityMembers,
      layout: s.layout,
      pvgis: s.pvgis,
    },
  };

  const items = read();
  items.push(snapshot);
  write(items);
  return snapshot;
}

export function deleteProject(id: string): void {
  write(read().filter((p) => p.id !== id));
}

export function loadProject(id: string): boolean {
  const items = read();
  const snapshot = items.find((p) => p.id === id);
  if (!snapshot) return false;

  const panel: PanelModel =
    DEFAULT_PANELS.find(
      (p) => `${p.manufacturer}|${p.model}` === snapshot.data.panelKey,
    ) ?? DEFAULT_PANELS[0];

  setState({
    clientName: snapshot.data.clientName,
    reference: snapshot.data.reference,
    address: snapshot.data.address,
    centroid: snapshot.data.centroid,
    parcelAreaM2: snapshot.data.parcelAreaM2,
    parcelGeometry: snapshot.data.parcelGeometry,
    panel,
    tiltDeg: snapshot.data.tiltDeg,
    azimuthDeg: snapshot.data.azimuthDeg,
    edgeMarginM: snapshot.data.edgeMarginM,
    ceLimit: snapshot.data.ceLimit,
    communityMembers: snapshot.data.communityMembers ?? [],
    layout: snapshot.data.layout,
    pvgis: snapshot.data.pvgis,
    status: snapshot.data.layout ? "ready" : "idle",
    error: null,
  });
  return true;
}
