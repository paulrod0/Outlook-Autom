import { NextResponse } from "next/server";
import * as turf from "@turf/turf";
import { parcelByRef, refByPoint } from "@/lib/catastro";
import { computeLayout, DEFAULT_PANELS } from "@/lib/panelLayout";
import { fetchPvgis } from "@/lib/pvgis";

export const runtime = "nodejs";

/**
 * Endpoint de validación interna del pipeline completo
 * (parcela → empaquetado → PVGIS). NO usado por la UI.
 * Mantener mientras el MVP esté en desarrollo.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lon = parseFloat(searchParams.get("lon") ?? "");
  const ref = searchParams.get("ref");
  const tiltDeg = parseFloat(searchParams.get("tilt") ?? "15");
  const azimuthDeg = parseFloat(searchParams.get("azimuth") ?? "180");
  const edgeMarginM = parseFloat(searchParams.get("margin") ?? "0.5");

  try {
    const parcel = ref
      ? await parcelByRef(ref)
      : await (async () => {
          const r = await refByPoint(lat, lon);
          return r ? parcelByRef(r.reference) : null;
        })();

    if (!parcel) {
      return NextResponse.json({ error: "Sin parcela" }, { status: 404 });
    }

    const t0 = Date.now();
    const layout = computeLayout({
      polygon: parcel.polygon,
      panel: DEFAULT_PANELS[0],
      tiltDeg,
      azimuthDeg,
      edgeMarginM,
    });
    const tLayout = Date.now() - t0;

    let pvgis: {
      yearlyKwh: number;
      specificYield: number;
    } | null = null;

    if (layout.peakPowerKwp > 0) {
      const [lonC, latC] = turf.centroid(turf.feature(parcel.polygon)).geometry
        .coordinates;
      const result = await fetchPvgis({
        lat: latC,
        lon: lonC,
        peakPowerKwp: layout.peakPowerKwp,
        tiltDeg,
        azimuthDeg: azimuthDeg - 180,
      });
      pvgis = {
        yearlyKwh: Math.round(result.yearlyKwh),
        specificYield: Math.round(result.specificYield),
      };
    }

    return NextResponse.json({
      parcel: {
        reference: parcel.reference,
        areaM2: parcel.areaM2,
        polygonType: parcel.polygon.type,
      },
      layout: {
        panelCount: layout.panelCount,
        peakPowerKwp: layout.peakPowerKwp,
        usableAreaM2: layout.usableAreaM2,
        rowSpacingM: layout.rowSpacingM,
        msComputed: tLayout,
      },
      pvgis,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}
