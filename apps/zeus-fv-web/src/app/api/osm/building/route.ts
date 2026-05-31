import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 3600;

/**
 * OSM Buildings: alternativa a Catastro WFS BU cuando el polígono que
 * devuelve Catastro no coincide con la imagen satélite (es habitual en
 * naves con marquesinas o canopies registrados como "edificio").
 *
 * Llama a Overpass API con un radio de 80 m alrededor del punto y
 * devuelve el edificio más cercano que contiene/cubre la mayor área.
 *
 * GET /api/osm/building?lat=...&lon=...
 */
// Overpass tiene varios mirrors; algunos rechazan tráfico de cloud IPs.
// Intentamos en orden hasta encontrar uno que responda.
const OVERPASS_INSTANCES = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
];

type OverpassNode = { lat: number; lon: number };
type OverpassWay = {
  type: "way";
  id: number;
  geometry: OverpassNode[];
  tags?: Record<string, string>;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lon = parseFloat(searchParams.get("lon") ?? "");
  const radius = parseFloat(searchParams.get("radius") ?? "80");

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json(
      { error: "Parámetros 'lat' y 'lon' obligatorios" },
      { status: 400 },
    );
  }

  const query = `[out:json][timeout:25];(way["building"](around:${radius},${lat},${lon}););out geom;`;
  try {
    let data: { elements?: OverpassWay[] } | null = null;
    let lastErr: unknown = null;
    for (const instance of OVERPASS_INSTANCES) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 10000);
        const res = await fetch(instance, {
          method: "POST",
          signal: ctrl.signal,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36",
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: `data=${encodeURIComponent(query)}`,
        });
        clearTimeout(t);
        if (!res.ok) {
          lastErr = new Error(`HTTP ${res.status} at ${instance}`);
          continue;
        }
        data = (await res.json()) as { elements?: OverpassWay[] };
        break;
      } catch (err) {
        lastErr = err;
        continue;
      }
    }
    if (!data) {
      return NextResponse.json(
        {
          error:
            lastErr instanceof Error
              ? `Overpass: ${lastErr.message}`
              : "Overpass: sin respuesta de ningún mirror",
        },
        { status: 502 },
      );
    }
    const ways = (data.elements ?? []).filter((e) => e.type === "way");
    if (ways.length === 0) {
      return NextResponse.json(
        { error: "Sin edificios OSM en esa zona" },
        { status: 404 },
      );
    }

    // Elegir el way con mayor área que contiene (o está más cerca de) el punto.
    let best: OverpassWay | null = null;
    let bestScore = -Infinity;
    for (const w of ways) {
      if (!w.geometry || w.geometry.length < 4) continue;
      const ring: [number, number][] = w.geometry.map((p) => [p.lon, p.lat]);
      // Cerrar si no lo está
      if (
        ring[0][0] !== ring[ring.length - 1][0] ||
        ring[0][1] !== ring[ring.length - 1][1]
      ) {
        ring.push(ring[0]);
      }
      const contains = pointInRing(lon, lat, ring);
      const area = ringAreaM2(ring);
      // Prioridad: contiene el punto > área grande > cercanía al centroide
      const score = (contains ? 1e9 : 0) + area;
      if (score > bestScore) {
        bestScore = score;
        best = w;
      }
    }

    if (!best) {
      return NextResponse.json(
        { error: "No se pudo determinar el edificio" },
        { status: 404 },
      );
    }

    const ring: [number, number][] = best.geometry.map((p) => [p.lon, p.lat]);
    if (
      ring[0][0] !== ring[ring.length - 1][0] ||
      ring[0][1] !== ring[ring.length - 1][1]
    ) {
      ring.push(ring[0]);
    }
    const areaM2 = ringAreaM2(ring);

    return NextResponse.json({
      source: "osm",
      osmWayId: best.id,
      tags: best.tags ?? {},
      areaM2: Math.round(areaM2),
      polygon: { type: "Polygon", coordinates: [ring] },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 502 },
    );
  }
}

function pointInRing(
  x: number,
  y: number,
  ring: [number, number][],
): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-15) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function ringAreaM2(ring: [number, number][]): number {
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[i + 1];
    const x1 = lon1 * Math.cos((lat1 * Math.PI) / 180) * 111320;
    const x2 = lon2 * Math.cos((lat2 * Math.PI) / 180) * 111320;
    const y1 = lat1 * 110540;
    const y2 = lat2 * 110540;
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}
