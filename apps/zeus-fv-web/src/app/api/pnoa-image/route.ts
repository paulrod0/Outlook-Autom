import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Proxy de la ortofoto PNOA (IGN) para el cliente.
 *
 * El navegador no puede hacer fetch directo de la WMS del IGN por CORS,
 * así que el servidor la descarga y la reenvía. Lo usa el segmentador de
 * tejado por IA (MobileSAM corre en el navegador con esta imagen).
 *
 * GET /api/pnoa-image?bbox=minX,minY,maxX,maxY&px=1024   (EPSG:3857)
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const bbox = searchParams.get("bbox");
  const px = Math.min(2048, Math.max(256, parseInt(searchParams.get("px") ?? "1024", 10)));
  if (!bbox || bbox.split(",").length !== 4) {
    return NextResponse.json({ error: "bbox EPSG:3857 obligatorio" }, { status: 400 });
  }
  const url =
    "https://www.ign.es/wms-inspire/pnoa-ma?service=WMS&request=GetMap&version=1.3.0" +
    "&layers=OI.OrthoimageCoverage&styles=&format=image/jpeg&transparent=false" +
    `&crs=EPSG:3857&width=${px}&height=${px}&bbox=${bbox}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "image/jpeg" },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ error: `PNOA ${res.status}` }, { status: 502 });
    }
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error PNOA" },
      { status: 502 },
    );
  }
}
