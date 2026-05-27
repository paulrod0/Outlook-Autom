/**
 * Persistencia de proyectos — capa híbrida.
 *
 * Si hay base de datos configurada en el servidor (DATABASE_URL de Neon),
 * los Route Handlers /api/projects responden y usamos Neon. Si no
 * (responden 501), caemos a localStorage del navegador.
 *
 * La detección se cachea tras la primera llamada para no repetir el probe.
 */

import type { CommunityMember } from "./community";
import type { LayoutResult, PanelModel } from "./panelLayout";
import { DEFAULT_PANELS } from "./panelLayout";
import { getState, setState } from "./store";

const STORAGE_KEY = "zeus-fv:projects:v1";

export type ProjectSnapshotData = {
  clientName: string;
  reference: string | null;
  address: string | null;
  centroid: { lat: number; lon: number } | null;
  parcelAreaM2: number | null;
  parcelGeometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  buildingGeometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  panelKey: string;
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

export type ProjectSnapshot = {
  id: string;
  name: string;
  savedAt: string;
  data: ProjectSnapshotData;
};

// --- detección de backend ---

let dbEnabled: boolean | null = null;

async function detectDb(): Promise<boolean> {
  if (dbEnabled !== null) return dbEnabled;
  try {
    const res = await fetch("/api/projects", { method: "GET" });
    // 501 = DB no configurada → local. Cualquier 2xx = DB activa.
    dbEnabled = res.status !== 501;
  } catch {
    dbEnabled = false;
  }
  return dbEnabled;
}

/** Etiqueta legible del backend de persistencia activo. */
export async function getBackend(): Promise<"neon" | "local"> {
  return (await detectDb()) ? "neon" : "local";
}

// --- snapshot desde el estado actual ---

function snapshotData(): ProjectSnapshotData {
  const s = getState();
  return {
    clientName: s.clientName,
    reference: s.reference,
    address: s.address,
    centroid: s.centroid,
    parcelAreaM2: s.parcelAreaM2,
    parcelGeometry: s.parcelGeometry,
    buildingGeometry: s.buildingGeometry,
    panelKey: `${s.panel.manufacturer}|${s.panel.model}`,
    tiltDeg: s.tiltDeg,
    azimuthDeg: s.azimuthDeg,
    edgeMarginM: s.edgeMarginM,
    ceLimit: s.ceLimit,
    communityMembers: s.communityMembers,
    layout: s.layout,
    pvgis: s.pvgis,
  };
}

function displayName(name: string | undefined, data: ProjectSnapshotData) {
  return name?.trim() || data.clientName.trim() || data.reference || "Sin título";
}

// --- localStorage backend ---

function readLocal(): ProjectSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ProjectSnapshot[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(items: ProjectSnapshot[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// --- API pública (async) ---

export async function listProjects(): Promise<ProjectSnapshot[]> {
  if (await detectDb()) {
    const res = await fetch("/api/projects");
    if (res.ok) return (await res.json()) as ProjectSnapshot[];
  }
  return readLocal().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function saveCurrentProject(name?: string): Promise<ProjectSnapshot> {
  const data = snapshotData();
  const finalName = displayName(name, data);

  if (await detectDb()) {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: finalName, data }),
    });
    if (res.ok) return (await res.json()) as ProjectSnapshot;
  }

  const snapshot: ProjectSnapshot = {
    id: uid(),
    name: finalName,
    savedAt: new Date().toISOString(),
    data,
  };
  const items = readLocal();
  items.push(snapshot);
  writeLocal(items);
  return snapshot;
}

export async function deleteProject(id: string): Promise<void> {
  if (await detectDb()) {
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (res.ok) return;
  }
  writeLocal(readLocal().filter((p) => p.id !== id));
}

export async function loadProject(id: string): Promise<boolean> {
  let snapshot: ProjectSnapshot | undefined;

  if (await detectDb()) {
    const res = await fetch(`/api/projects/${id}`);
    if (res.ok) snapshot = (await res.json()) as ProjectSnapshot;
  }
  if (!snapshot) {
    snapshot = readLocal().find((p) => p.id === id);
  }
  if (!snapshot) return false;

  applySnapshot(snapshot.data);
  return true;
}

function applySnapshot(data: ProjectSnapshotData): void {
  const panel: PanelModel =
    DEFAULT_PANELS.find(
      (p) => `${p.manufacturer}|${p.model}` === data.panelKey,
    ) ?? DEFAULT_PANELS[0];

  setState({
    clientName: data.clientName,
    reference: data.reference,
    address: data.address,
    centroid: data.centroid,
    parcelAreaM2: data.parcelAreaM2,
    parcelGeometry: data.parcelGeometry,
    buildingGeometry: data.buildingGeometry ?? null,
    panel,
    tiltDeg: data.tiltDeg,
    azimuthDeg: data.azimuthDeg,
    edgeMarginM: data.edgeMarginM,
    ceLimit: data.ceLimit,
    communityMembers: data.communityMembers ?? [],
    layout: data.layout,
    pvgis: data.pvgis,
    status: data.layout ? "ready" : "idle",
    error: null,
  });
}
