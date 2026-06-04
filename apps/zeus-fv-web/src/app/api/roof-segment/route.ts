import { NextResponse } from "next/server";
import { segmentRoof } from "@/lib/roofSegment";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/roof-segment  { lat, lon, boxM? }
 *
 * Segmenta el tejado con IA (MobileSAM) sobre la ortofoto PNOA y devuelve
 * el polígono exacto, alineado al píxel con la imagen. Click-to-segment
 * estilo SolarEdge/Google, pero local y gratis.
 */
export async function POST(req: Request) {
  let body: { lat?: number; lon?: number; boxM?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const lat = Number(body.lat);
  const lon = Number(body.lon);
  const boxM = Math.min(220, Math.max(40, Number(body.boxM) || 80));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "lat/lon obligatorios" }, { status: 400 });
  }

  const origin = new URL(req.url).origin;
  try {
    const result = await segmentRoof(origin, lat, lon, boxM);
    if (!result) {
      return NextResponse.json(
        { error: "La IA no detectó un tejado claro en ese punto. Prueba a centrar mejor o usa el trazado manual." },
        { status: 404 },
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error de segmentación" },
      { status: 502 },
    );
  }
}
