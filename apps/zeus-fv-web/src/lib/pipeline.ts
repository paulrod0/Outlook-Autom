"use client";

import * as turf from "@turf/turf";
import { computeLayout } from "@/lib/panelLayout";
import { getState, setState } from "@/lib/store";

/**
 * Orquesta el flujo completo MVP a partir de un punto del mapa:
 *  1) llamada a /api/catastro/by-point → parcela
 *  2) computeLayout local → panel grid
 *  3) llamada a /api/pvgis → producción anual
 */
export async function runFromPoint(lat: number, lon: number) {
  setState({ status: "loading-parcel", error: null });

  try {
    const res = await fetch(
      `/api/catastro/by-point?lat=${lat}&lon=${lon}`,
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error ?? "Catastro: error");
    }
    const parcel = (await res.json()) as {
      reference: string;
      address?: string;
      areaM2?: number;
      polygon: GeoJSON.Polygon | GeoJSON.MultiPolygon;
    };

    const centroid = turf.centroid(turf.feature(parcel.polygon)).geometry.coordinates;

    setState({
      reference: parcel.reference,
      address: parcel.address ?? null,
      parcelAreaM2: parcel.areaM2 ?? null,
      parcelGeometry: parcel.polygon,
      centroid: { lon: centroid[0], lat: centroid[1] },
      status: "computing",
    });

    await runLayoutAndPvgis();
  } catch (err) {
    setState({
      status: "error",
      error: err instanceof Error ? err.message : "Error desconocido",
    });
  }
}

/**
 * Recalcula layout + PVGIS con la parcela actual y los parámetros del store.
 * Útil cuando el usuario cambia tilt, azimut, modelo de panel o margen.
 */
export async function runLayoutAndPvgis() {
  const s = getState();
  if (!s.parcelGeometry || !s.centroid) return;

  setState({ status: "computing" });

  const layout = computeLayout({
    polygon: s.parcelGeometry,
    panel: s.panel,
    tiltDeg: s.tiltDeg,
    azimuthDeg: s.azimuthDeg,
    edgeMarginM: s.edgeMarginM,
    maxKwp: s.ceLimit ? 130 : undefined,
  });

  setState({ layout });

  if (layout.peakPowerKwp <= 0) {
    setState({ status: "ready", pvgis: null });
    return;
  }

  setState({ status: "loading-pvgis" });

  try {
    const url = new URL("/api/pvgis", window.location.origin);
    url.searchParams.set("lat", s.centroid.lat.toString());
    url.searchParams.set("lon", s.centroid.lon.toString());
    url.searchParams.set("kwp", layout.peakPowerKwp.toString());
    url.searchParams.set("tilt", s.tiltDeg.toString());
    // PVGIS aspect: 0 = Sur. Internamente trabajamos con 180 = Sur.
    url.searchParams.set("azimuth", (s.azimuthDeg - 180).toString());
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error ?? "PVGIS: error");
    }
    const pvgis = (await res.json()) as {
      yearlyKwh: number;
      specificYield: number;
      monthlyKwh: number[];
    };
    setState({ pvgis, status: "ready" });
  } catch (err) {
    setState({
      status: "error",
      error: err instanceof Error ? err.message : "PVGIS: error",
    });
  }
}
