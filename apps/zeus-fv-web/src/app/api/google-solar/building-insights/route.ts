import { NextResponse } from "next/server";
import {
  buildingInsights,
  isGoogleSolarEnabled,
  segmentToPolygon,
  type RoofSegmentStats,
} from "@/lib/googleSolar";

export const runtime = "nodejs";
export const revalidate = 86400; // 24h — los datos no cambian con frecuencia

/**
 * GET /api/google-solar/building-insights?lat=...&lon=...
 *
 * Devuelve los segmentos del techo detectados por la IA de Google Solar,
 * cada uno con su tilt + azimut + polígono aproximado.
 *
 * Tomamos cada segmento como un faldón candidato para la app Eficiencia.
 *
 * Coste: ~0,10-5 € por llamada según la calidad de la imagen. Cacheamos
 * 24h por coordenada para evitar gastos repetidos.
 */
export async function GET(req: Request) {
  if (!isGoogleSolarEnabled()) {
    return NextResponse.json(
      { error: "GOOGLE_SOLAR_API_KEY no configurada" },
      { status: 501 },
    );
  }

  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lon = parseFloat(searchParams.get("lon") ?? "");
  const quality = (searchParams.get("quality") ?? "LOW").toUpperCase() as
    | "HIGH"
    | "MEDIUM"
    | "LOW";

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json(
      { error: "Parámetros 'lat' y 'lon' obligatorios" },
      { status: 400 },
    );
  }

  try {
    const data = await buildingInsights(lat, lon, quality);
    const sp = data.solarPotential;

    // Convertir cada segmento a un faldón listo para nuestro store.
    const planes = sp.roofSegmentStats.map((seg: RoofSegmentStats, i) => ({
      id: `gs-${i}`,
      label: `Faldón ${i + 1} · ${seg.pitchDegrees.toFixed(0)}° / ${seg.azimuthDegrees.toFixed(0)}°`,
      polygon: segmentToPolygon(seg),
      tiltDeg: Math.round(seg.pitchDegrees),
      azimuthDeg: Math.round(seg.azimuthDegrees),
      areaM2: Math.round(seg.stats.areaMeters2 ?? 0),
      sunshineHoursAvg: seg.stats.sunshineQuantiles?.[5] ?? null,
    }));

    return NextResponse.json({
      imageryQuality: data.imageryQuality,
      imageryDate: data.imageryDate,
      regionCode: data.regionCode,
      potential: {
        maxPanels: sp.maxArrayPanelsCount,
        maxKwp: sp.panelCapacityWatts
          ? (sp.maxArrayPanelsCount * sp.panelCapacityWatts) / 1000
          : null,
        maxArrayM2: Math.round(sp.maxArrayAreaMeters2),
        sunshineHoursPerYear: Math.round(sp.maxSunshineHoursPerYear),
        carbonOffsetKgPerMwh: sp.carbonOffsetFactorKgPerMwh ?? null,
      },
      planes,
      buildingCenter: data.center,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    const status = msg.includes("404") ? 404 : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}
