import { NextResponse } from "next/server";
import { analyzeRoof } from "@/lib/roofAnalysis";

export const runtime = "nodejs";
export const maxDuration = 30;
export const revalidate = 86400; // cache 24h por coordenada

/**
 * GET /api/roof-analysis?lat=...&lon=...&box=200
 *
 * Análisis de cubierta con LiDAR del IGN (gratis, sin API key).
 * Devuelve pendiente, orientación, plano/inclinado, altura del edificio,
 * faldones detectados y la huella real del edificio desde elevación.
 *
 * Alternativa nativa a la Google Solar API para territorio español.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lon = parseFloat(searchParams.get("lon") ?? "");
  const box = Math.min(400, Math.max(80, parseFloat(searchParams.get("box") ?? "220")));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json(
      { error: "Parámetros 'lat' y 'lon' obligatorios" },
      { status: 400 },
    );
  }

  try {
    let analysis = await analyzeRoof(lat, lon, box);
    // Si la huella toca el borde del parche, el edificio es mayor que la
    // caja analizada: reintentamos una vez con la caja máxima para
    // capturarlo completo.
    if (analysis.footprintTouchesEdge && box < 400) {
      try {
        const bigger = await analyzeRoof(lat, lon, 400);
        if (bigger.cellsBuilding >= analysis.cellsBuilding) analysis = bigger;
      } catch {
        // si el reintento falla, nos quedamos con el primero
      }
    }
    if (analysis.cellsBuilding < 3) {
      return NextResponse.json(
        {
          error:
            "No se detecta edificio en esa zona en el LiDAR del IGN (¿zona sin cobertura o sin construcción?).",
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
