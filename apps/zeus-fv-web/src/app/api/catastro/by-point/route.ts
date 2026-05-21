import { NextResponse } from "next/server";
import { parcelByRef, refByPoint } from "@/lib/catastro";

export const runtime = "nodejs";
export const revalidate = 3600;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const latStr = searchParams.get("lat");
  const lonStr = searchParams.get("lon");
  const lat = latStr ? parseFloat(latStr) : NaN;
  const lon = lonStr ? parseFloat(lonStr) : NaN;

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json(
      { error: "Parámetros 'lat' y 'lon' obligatorios" },
      { status: 400 },
    );
  }

  try {
    const ref = await refByPoint(lat, lon);
    if (!ref) {
      return NextResponse.json(
        { error: "Sin parcela catastral en ese punto" },
        { status: 404 },
      );
    }
    const parcel = await parcelByRef(ref.reference);
    if (!parcel) {
      return NextResponse.json(
        { error: "Polígono no disponible", reference: ref.reference },
        { status: 404 },
      );
    }
    return NextResponse.json({ ...parcel, address: ref.address });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error en Catastro" },
      { status: 502 },
    );
  }
}
