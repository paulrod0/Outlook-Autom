import { z } from "zod";

/**
 * Cliente de PVGIS v5.3 (JRC, Comisión Europea).
 *
 * Endpoint: https://re.jrc.ec.europa.eu/api/v5_3/PVcalc
 * No requiere API key. Implementado para M3.
 */

export const PvgisInputSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  peakPowerKwp: z.number().positive(),
  tiltDeg: z.number().min(0).max(90).default(15),
  azimuthDeg: z.number().min(-180).max(180).default(0), // 0 = Sur en PVGIS
  systemLossPct: z.number().min(0).max(100).default(14),
  mounting: z.enum(["free", "building"]).default("building"),
  pvtech: z.enum(["crystSi", "CIS", "CdTe"]).default("crystSi"),
});

export type PvgisInput = z.input<typeof PvgisInputSchema>;

export type PvgisResult = {
  yearlyKwh: number;
  specificYield: number; // kWh/kWp·año
  monthlyKwh: number[]; // longitud 12
  raw: unknown;
};

const BASE = process.env.PVGIS_BASE_URL ?? "https://re.jrc.ec.europa.eu/api/v5_3";

export async function fetchPvgis(input: PvgisInput): Promise<PvgisResult> {
  const params = PvgisInputSchema.parse(input);
  const url = new URL(`${BASE}/PVcalc`);
  url.searchParams.set("lat", params.lat.toString());
  url.searchParams.set("lon", params.lon.toString());
  url.searchParams.set("peakpower", params.peakPowerKwp.toString());
  url.searchParams.set("loss", params.systemLossPct.toString());
  url.searchParams.set("angle", params.tiltDeg.toString());
  url.searchParams.set("aspect", params.azimuthDeg.toString());
  url.searchParams.set("mountingplace", params.mounting);
  url.searchParams.set("pvtechchoice", params.pvtech);
  url.searchParams.set("outputformat", "json");

  const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 } });
  if (!res.ok) {
    throw new Error(`PVGIS error ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as PvgisRawResponse;

  const yearlyKwh = data.outputs?.totals?.fixed?.E_y ?? 0;
  const monthlyKwh = (data.outputs?.monthly?.fixed ?? []).map((m) => m.E_m);
  const specificYield = params.peakPowerKwp > 0 ? yearlyKwh / params.peakPowerKwp : 0;

  return { yearlyKwh, specificYield, monthlyKwh, raw: data };
}

type PvgisRawResponse = {
  outputs?: {
    monthly?: { fixed?: Array<{ month: number; E_m: number }> };
    totals?: { fixed?: { E_y?: number } };
  };
};
