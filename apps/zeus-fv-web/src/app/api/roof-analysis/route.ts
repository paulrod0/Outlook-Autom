import { NextResponse } from "next/server";
import { analyzeRoof } from "@/lib/roofAnalysis";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Análisis de cubierta con LiDAR del IGN (gratis, sin API key).
 *
 * GET  ?lat&lon[&box]            → modo "edificio aislado" (componente
 *                                  conexa del centro).
 * POST { lat, lon, polygon }    → modo "cubierta concreta": restringe el
 *                                  análisis al polígono dado (Catastro/OSM/
 *                                  manual). Recomendado en zonas densas
 *                                  donde los edificios se fusionan a 2,5 m.
 *
 * Devuelve pendiente, orientación, plano/inclinado, altura, faldones
 * segmentados (con su polígono) y huella del edificio.
 */
function bboxOf(poly: GeoJSON.Polygon | GeoJSON.MultiPolygon) {
  let minLon = Infinity,
    minLat = Infinity,
    maxLon = -Infinity,
    maxLat = -Infinity;
  const polys = poly.type === "Polygon" ? [poly.coordinates] : poly.coordinates;
  for (const rings of polys)
    for (const ring of rings)
      for (const [lon, lat] of ring) {
        if (lon < minLon) minLon = lon;
        if (lat < minLat) minLat = lat;
        if (lon > maxLon) maxLon = lon;
        if (lat > maxLat) maxLat = lat;
      }
  return { minLon, minLat, maxLon, maxLat };
}

async function run(
  lat: number,
  lon: number,
  box: number,
  polygon: GeoJSON.Polygon | GeoJSON.MultiPolygon | null,
) {
  let analysis = await analyzeRoof(lat, lon, box, polygon);
  // Sin polígono: auto-ampliar si la huella toca el borde (edificio grande).
  if (!polygon && analysis.footprintTouchesEdge && box < 400) {
    try {
      const bigger = await analyzeRoof(lat, lon, 400, null);
      if (bigger.cellsBuilding >= analysis.cellsBuilding) analysis = bigger;
    } catch {
      /* nos quedamos con el primero */
    }
  }
  return analysis;
}

export async function POST(req: Request) {
  let body: { lat?: number; lon?: number; polygon?: GeoJSON.Polygon | GeoJSON.MultiPolygon };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const lat = Number(body.lat);
  const lon = Number(body.lon);
  const polygon = body.polygon ?? null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "lat/lon obligatorios" }, { status: 400 });
  }

  // Caja: si hay polígono, su bbox + 30 m de margen (cap 80-400 m).
  let box = 220;
  if (polygon) {
    const b = bboxOf(polygon);
    const wLon = (b.maxLon - b.minLon) * 85000;
    const wLat = (b.maxLat - b.minLat) * 111000;
    box = Math.min(400, Math.max(80, Math.max(wLon, wLat) + 60));
  }

  try {
    const analysis = await run(lat, lon, box, polygon);
    if (analysis.cellsBuilding < 3) {
      return NextResponse.json(
        {
          error:
            "No se detecta edificio en el LiDAR del IGN dentro de esa cubierta (¿zona sin cobertura, sin construcción, o polígono fuera del edificio?).",
        },
        { status: 404 },
      );
    }
    return NextResponse.json(analysis);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error análisis LiDAR" },
      { status: 502 },
    );
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lon = parseFloat(searchParams.get("lon") ?? "");
  const box = Math.min(400, Math.max(80, parseFloat(searchParams.get("box") ?? "220")));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "lat/lon obligatorios" }, { status: 400 });
  }
  try {
    const analysis = await run(lat, lon, box, null);
    if (analysis.cellsBuilding < 3) {
      return NextResponse.json(
        { error: "No se detecta edificio en esa zona en el LiDAR del IGN." },
        { status: 404 },
      );
    }
    return NextResponse.json(analysis);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error análisis LiDAR" },
      { status: 502 },
    );
  }
}
