"use client";

import * as turf from "@turf/turf";
import { computeLayout } from "@/lib/panelLayout";
import { getState, setState } from "@/lib/store";

export async function loadBuildingFor(ref: string) {
  try {
    const res = await fetch(`/api/catastro/building?ref=${encodeURIComponent(ref)}`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      polygon: GeoJSON.Polygon | GeoJSON.MultiPolygon;
    };
    if (!data?.polygon) return;
    setState({ buildingGeometry: data.polygon });

    // Auto-recortar a la huella del edificio: los paneles van en el TEJADO,
    // nunca en el jardín/piscina/viales de la parcela. Recortamos siempre
    // que haya un edificio de tamaño razonable (≥30 m²) y más pequeño que
    // la parcela. Esto es CRÍTICO en chalets con jardín, donde el edificio
    // es una fracción pequeña del solar (antes se rellenaba el solar entero).
    const s = getState();
    if (!s.parcelGeometry) return;
    try {
      const parcelArea = turf.area(turf.feature(s.parcelGeometry));
      const buildingArea = turf.area(turf.feature(data.polygon));
      if (parcelArea <= 0 || buildingArea <= 0) return;
      const ratio = buildingArea / parcelArea;
      if (buildingArea >= 30 && ratio <= 0.98) {
        clipParcelToBuilding();
      }
    } catch {
      // si turf falla, dejamos al usuario decidir manualmente
    }
  } catch {
    // sin huella → seguimos con la parcela completa
  }
}

/**
 * Sustituye el polígono activo por la huella del edificio (intersección
 * con la parcela, para no salirnos en casos de geometrías ligeramente
 * desalineadas). Si no hay edificio, no hace nada.
 */
export function clipParcelToBuilding(): void {
  const s = getState();
  if (!s.parcelGeometry || !s.buildingGeometry) return;

  const parcel = turf.feature(s.parcelGeometry);
  const building = turf.feature(s.buildingGeometry);
  let clipped: GeoJSON.Polygon | GeoJSON.MultiPolygon | null = null;

  try {
    const inter = turf.intersect(
      turf.featureCollection([
        parcel as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
        building as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
      ]),
    );
    if (inter && inter.geometry) {
      const geom = inter.geometry as
        | GeoJSON.Polygon
        | GeoJSON.MultiPolygon;
      if (geom.type === "Polygon" || geom.type === "MultiPolygon") {
        clipped = geom;
      }
    }
  } catch {
    // si turf.intersect falla, usamos la huella del edificio directamente
  }

  setState({
    parcelGeometry: clipped ?? s.buildingGeometry,
    parcelAreaM2: turf.area(turf.feature(clipped ?? s.buildingGeometry)),
  });
  void runLayoutAndPvgis();
}

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
      buildingGeometry: null,
      centroid: { lon: centroid[0], lat: centroid[1] },
      status: "computing",
    });

    // Cargar la huella del edificio en paralelo. No bloquea el cálculo:
    // si no llega, simplemente no aparece la opción "Recortar al edificio".
    void loadBuildingFor(parcel.reference);

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
  if (!s.centroid) return;

  // Modo multi-faldón: si hay roofPlanes, ignoramos parcelGeometry y
  // calculamos por faldón sumando producción.
  if (s.roofPlanes.length > 0) {
    return runMultiPlaneFlow();
  }

  if (!s.parcelGeometry) return;
  setState({ status: "computing" });

  const layout = computeLayout({
    polygon: s.parcelGeometry,
    panel: s.panel,
    tiltDeg: s.tiltDeg,
    azimuthDeg: s.azimuthDeg,
    edgeMarginM: s.edgeMarginM,
    rowSpacingM: s.rowSpacingOverrideM ?? undefined,
    columnGapM: s.columnGapM,
    obstacles: s.obstacles,
    maxKwp: s.ceLimit ? 130 : undefined,
  });

  setState({ layout });

  if (layout.peakPowerKwp <= 0) {
    setState({ status: "ready", pvgis: null });
    return;
  }

  setState({ status: "loading-pvgis" });

  try {
    const pvgis = await fetchPvgisOnce({
      lat: s.centroid.lat,
      lon: s.centroid.lon,
      kwp: layout.peakPowerKwp,
      tiltDeg: s.tiltDeg,
      azimuthDeg: s.azimuthDeg,
    });
    setState({ pvgis, status: "ready" });
  } catch (err) {
    setState({
      status: "error",
      error: err instanceof Error ? err.message : "PVGIS: error",
    });
  }
}

/**
 * Flujo multi-faldón: computa layout para cada plano con su tilt/azimut
 * propios y agrega resultados (paneles, kWp, producción).
 */
async function runMultiPlaneFlow() {
  const s = getState();
  if (!s.centroid) return;
  setState({ status: "computing" });

  const enabled = s.roofPlanes.filter((p) => p.enabled);
  if (enabled.length === 0) {
    setState({
      status: "ready",
      layout: null,
      pvgis: null,
    });
    return;
  }

  // Calcular layout por faldón.
  type PerPlane = {
    planeId: string;
    label: string;
    tiltDeg: number;
    azimuthDeg: number;
    panels: GeoJSON.Feature<GeoJSON.Polygon>[];
    panelCount: number;
    peakPowerKwp: number;
    usableAreaM2: number;
    rowSpacingM: number;
  };
  const perPlane: PerPlane[] = [];
  for (const plane of enabled) {
    const result = computeLayout({
      polygon: plane.polygon,
      panel: s.panel,
      tiltDeg: plane.tiltDeg,
      azimuthDeg: plane.azimuthDeg,
      edgeMarginM: s.edgeMarginM,
      rowSpacingM: s.rowSpacingOverrideM ?? undefined,
      columnGapM: s.columnGapM,
      obstacles: plane.obstacles,
      maxKwp: s.ceLimit ? 130 / enabled.length : undefined,
    });
    perPlane.push({
      planeId: plane.id,
      label: plane.label,
      tiltDeg: plane.tiltDeg,
      azimuthDeg: plane.azimuthDeg,
      panels: result.panels,
      panelCount: result.panelCount,
      peakPowerKwp: result.peakPowerKwp,
      usableAreaM2: result.usableAreaM2,
      rowSpacingM: result.rowSpacingM,
    });
  }

  const allPanels = perPlane.flatMap((p) => p.panels);
  const peakPowerKwp = perPlane.reduce((acc, p) => acc + p.peakPowerKwp, 0);
  const panelCount = perPlane.reduce((acc, p) => acc + p.panelCount, 0);
  const usableAreaM2 = perPlane.reduce((acc, p) => acc + p.usableAreaM2, 0);
  const rowSpacingM = perPlane.length > 0 ? perPlane[0].rowSpacingM : 0;

  setState({
    layout: {
      panels: allPanels,
      panelCount,
      peakPowerKwp: Number(peakPowerKwp.toFixed(2)),
      usableAreaM2: Number(usableAreaM2.toFixed(1)),
      rowSpacingM: Number(rowSpacingM.toFixed(2)),
      gridRotationDeg: 0,
    },
  });

  if (peakPowerKwp <= 0) {
    setState({ status: "ready", pvgis: null });
    return;
  }

  setState({ status: "loading-pvgis" });
  try {
    // PVGIS por faldón → suma de kWh anuales y curva mensual agregada.
    const results = await Promise.all(
      perPlane
        .filter((p) => p.peakPowerKwp > 0)
        .map((p) =>
          fetchPvgisOnce({
            lat: s.centroid!.lat,
            lon: s.centroid!.lon,
            kwp: p.peakPowerKwp,
            tiltDeg: p.tiltDeg,
            azimuthDeg: p.azimuthDeg,
          }),
        ),
    );
    if (results.length === 0) {
      setState({ status: "ready", pvgis: null });
      return;
    }
    const yearlyKwh = results.reduce((acc, r) => acc + r.yearlyKwh, 0);
    const monthlyKwh = Array.from({ length: 12 }).map((_, i) =>
      results.reduce((acc, r) => acc + (r.monthlyKwh[i] ?? 0), 0),
    );
    const specificYield = peakPowerKwp > 0 ? yearlyKwh / peakPowerKwp : 0;
    setState({
      pvgis: {
        yearlyKwh: Math.round(yearlyKwh),
        specificYield: Math.round(specificYield),
        monthlyKwh: monthlyKwh.map((v) => Math.round(v)),
      },
      status: "ready",
    });
  } catch (err) {
    setState({
      status: "error",
      error: err instanceof Error ? err.message : "PVGIS: error",
    });
  }
}

async function fetchPvgisOnce(args: {
  lat: number;
  lon: number;
  kwp: number;
  tiltDeg: number;
  azimuthDeg: number;
}): Promise<{ yearlyKwh: number; specificYield: number; monthlyKwh: number[] }> {
  const url = new URL("/api/pvgis", window.location.origin);
  url.searchParams.set("lat", args.lat.toString());
  url.searchParams.set("lon", args.lon.toString());
  url.searchParams.set("kwp", args.kwp.toString());
  url.searchParams.set("tilt", args.tiltDeg.toString());
  // PVGIS aspect: 0 = Sur. Internamente trabajamos con 180 = Sur.
  url.searchParams.set("azimuth", (args.azimuthDeg - 180).toString());
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "PVGIS: error");
  }
  return (await res.json()) as {
    yearlyKwh: number;
    specificYield: number;
    monthlyKwh: number[];
  };
}
