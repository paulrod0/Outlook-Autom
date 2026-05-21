"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_PANELS, type LayoutResult, type PanelModel } from "@/lib/panelLayout";

export type ProjectState = {
  clientName: string;
  reference: string | null;
  address: string | null;
  centroid: { lat: number; lon: number } | null;
  parcelAreaM2: number | null;
  parcelGeometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  panel: PanelModel;
  tiltDeg: number;
  azimuthDeg: number;
  edgeMarginM: number;
  layout: LayoutResult | null;
  pvgis: {
    yearlyKwh: number;
    specificYield: number;
    monthlyKwh: number[];
  } | null;
  status: "idle" | "loading-parcel" | "computing" | "loading-pvgis" | "ready" | "error";
  error: string | null;
};

const initialState: ProjectState = {
  clientName: "",
  reference: null,
  address: null,
  centroid: null,
  parcelAreaM2: null,
  parcelGeometry: null,
  panel: DEFAULT_PANELS[0],
  tiltDeg: 15,
  azimuthDeg: 180,
  edgeMarginM: 0.5,
  layout: null,
  pvgis: null,
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
