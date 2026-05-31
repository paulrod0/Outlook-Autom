"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_PANELS, type LayoutResult, type PanelModel } from "@/lib/panelLayout";
import type { CommunityMember } from "@/lib/community";

export type BillSummary = {
  cups?: string;
  tariff?: string;
  contractedPowerKw?: number[];
  periodConsumptionKwh?: number;
  periodStart?: string;
  periodEnd?: string;
  estimatedAnnualKwh?: number;
  totalEur?: number;
  supplyAddress?: string;
};

export type ProductType = "fv" | "ce" | "ppa";

export type StructuralAttachment = {
  name: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
};

export type ProjectState = {
  productType: ProductType;
  clientName: string;
  commercialName: string;
  commissionEur: number;
  reference: string | null;
  address: string | null;
  centroid: { lat: number; lon: number } | null;
  parcelAreaM2: number | null;
  parcelGeometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  // Huella del edificio según WFS BU de Catastro (puede ser null si no hay).
  buildingGeometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  panel: PanelModel;
  tiltDeg: number;
  azimuthDeg: number;
  edgeMarginM: number;
  /** Override manual de la separación entre filas (m). null = auto (solsticio). */
  rowSpacingOverrideM: number | null;
  /** Separación adicional entre columnas (m). 0 = paneles pegados. */
  columnGapM: number;
  /** Lista de obstáculos sobre la cubierta (skylights, HVAC, chimeneas). */
  obstacles: GeoJSON.Polygon[];
  ceLimit: boolean; // si true, aplica el máx 130 kWp por refcat (Fase 1)
  communityMembers: CommunityMember[];
  bill: BillSummary | null;
  layout: LayoutResult | null;
  pvgis: {
    yearlyKwh: number;
    specificYield: number;
    monthlyKwh: number[];
  } | null;
  // PPA: parámetros del contrato sin inversión.
  ppa: {
    energyPriceEurKwh: number; // p.ej. 0.069
    contractYears: number;     // 15, 20, 25
    indexationPct: number;     // 2% anual
  };
  // CE: parámetros del contrato de cesión de cubierta.
  ce: {
    optionYears: 20 | 25 | 30;
    incomeAnnualEur: number;   // €/año fijos por la opción elegida
  };
  // Estudio estructural adjunto (opcional, hasta ~5MB).
  structural: StructuralAttachment | null;
  status: "idle" | "loading-parcel" | "computing" | "loading-pvgis" | "ready" | "error";
  error: string | null;
};

const initialState: ProjectState = {
  productType: "fv",
  clientName: "",
  commercialName: "",
  commissionEur: 0,
  reference: null,
  address: null,
  centroid: null,
  parcelAreaM2: null,
  parcelGeometry: null,
  buildingGeometry: null,
  panel: DEFAULT_PANELS[0],
  tiltDeg: 15,
  azimuthDeg: 180,
  edgeMarginM: 0.5,
  rowSpacingOverrideM: null,
  columnGapM: 0,
  obstacles: [],
  ceLimit: false,
  communityMembers: [],
  bill: null,
  layout: null,
  pvgis: null,
  ppa: {
    energyPriceEurKwh: 0.069,
    contractYears: 15,
    indexationPct: 2,
  },
  ce: {
    optionYears: 30,
    incomeAnnualEur: 0,
  },
  structural: null,
  status: "idle",
  error: null,
};

let state: ProjectState = initialState;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function getState(): ProjectState {
  return state;
}

export function setState(partial: Partial<ProjectState>): void {
  state = { ...state, ...partial };
  emit();
}

export function resetProject(): void {
  state = initialState;
  emit();
}

/**
 * Añade un anillo de exclusión (hole) al polígono activo de la parcela.
 * Sólo soportado para Polygon (no MultiPolygon).
 */
export function addExclusionHole(ring: GeoJSON.Position[]): void {
  if (!state.parcelGeometry || state.parcelGeometry.type !== "Polygon") return;
  if (ring.length < 4) return;
  const next: GeoJSON.Polygon = {
    type: "Polygon",
    coordinates: [...state.parcelGeometry.coordinates, ring],
  };
  setState({ parcelGeometry: next });
}

export function clearExclusionHoles(): void {
  if (!state.parcelGeometry || state.parcelGeometry.type !== "Polygon") return;
  if (state.parcelGeometry.coordinates.length <= 1) return;
  const next: GeoJSON.Polygon = {
    type: "Polygon",
    coordinates: [state.parcelGeometry.coordinates[0]],
  };
  setState({ parcelGeometry: next });
}

/** Añade un obstáculo (skylight, HVAC) al array. */
export function addObstacle(polygon: GeoJSON.Polygon): void {
  setState({ obstacles: [...state.obstacles, polygon] });
}

/** Quita el obstáculo en la posición indicada. */
export function removeObstacle(index: number): void {
  setState({ obstacles: state.obstacles.filter((_, i) => i !== index) });
}

/** Borra todos los obstáculos de la cubierta. */
export function clearObstacles(): void {
  if (state.obstacles.length === 0) return;
  setState({ obstacles: [] });
}

export function useProjectState(): ProjectState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getState,
    getState,
  );
}
