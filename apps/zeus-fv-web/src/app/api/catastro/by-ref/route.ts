import { NextResponse } from "next/server";
import { parcelByRef } from "@/lib/catastro";

export const runtime = "nodejs";
export const revalidate = 3600;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ref = searchParams.get("ref");
  if (!ref) {
    return NextResponse.json({ error: "Parámetro 'ref' obligatorio" }, { status: 400 });
  }

  try {
    const parcel = await parcelByRef(ref);
    if (!parcel) {
      return NextResponse.json({ error: "Parcela no encontrada" }, { status: 404 });
    }
    return NextResponse.json(parcel);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error en Catastro" },
      { status: 502 },
    );
  }
}
