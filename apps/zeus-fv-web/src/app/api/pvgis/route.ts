import { NextResponse } from "next/server";
import { fetchPvgis, PvgisInputSchema } from "@/lib/pvgis";

export const runtime = "nodejs";
export const revalidate = 86400; // 1 día en segundos

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const params = {
    lat: parseFloat(searchParams.get("lat") ?? ""),
    lon: parseFloat(searchParams.get("lon") ?? ""),
    peakPowerKwp: parseFloat(searchParams.get("kwp") ?? ""),
    tiltDeg: searchParams.get("tilt") ? parseFloat(searchParams.get("tilt")!) : undefined,
    azimuthDeg: searchParams.get("azimuth") ? parseFloat(searchParams.get("azimuth")!) : undefined,
    systemLossPct: searchParams.get("loss") ? parseFloat(searchParams.get("loss")!) : undefined,
  };

  const parsed = PvgisInputSchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Parámetros inválidos", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await fetchPvgis(parsed.data);
    return NextResponse.json(
      {
        yearlyKwh: Math.round(result.yearlyKwh),
        specificYield: Math.round(result.specificYield),
        monthlyKwh: result.monthlyKwh.map((n) => Math.round(n)),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
        },
      },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error en PVGIS" },
      { status: 502 },
    );
  }
}
