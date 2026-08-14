import "server-only";

/**
 * Cliente de la Google Solar API.
 *
 * La Solar API analiza imágenes aéreas con IA y devuelve, para un
 * edificio:
 *  - Segmentos del techo (cada faldón) con su pitch + azimut + área
 *  - Potencial solar (max paneles, max kWp, horas de sol/año)
 *  - Configuraciones pre-calculadas de paneles
 *
 * Es lo más parecido a SolarEdge Designer disponible para terceros.
 * Requiere `GOOGLE_SOLAR_API_KEY` (cuenta Google Cloud con Solar API
 * habilitada). Precio: ~0,10-5 € por consulta según la calidad de la
 * imagen disponible para esa zona.
 *
 * Docs: https://developers.google.com/maps/documentation/solar/overview
 */

const BASE_URL = "https://solar.googleapis.com/v1";

export function isGoogleSolarEnabled(): boolean {
  return !!process.env.GOOGLE_SOLAR_API_KEY;
}

function apiKey(): string {
  const k = process.env.GOOGLE_SOLAR_API_KEY;
  if (!k) throw new Error("GOOGLE_SOLAR_API_KEY no configurada");
  return k;
}

// --- Tipos (subset relevante) ---

export type RoofSegmentStats = {
  pitchDegrees: number;
  azimuthDegrees: number;
  stats: {
    areaMeters2: number;
    sunshineQuantiles?: number[];
    groundAreaMeters2?: number;
  };
  center: { latitude: number; longitude: number };
  boundingBox: {
    sw: { latitude: number; longitude: number };
    ne: { latitude: number; longitude: number };
  };
  planeHeightAtCenterMeters?: number;
};

export type SolarPotential = {
  maxArrayPanelsCount: number;
  maxArrayAreaMeters2: number;
  maxSunshineHoursPerYear: number;
  carbonOffsetFactorKgPerMwh?: number;
  wholeRoofStats?: {
    areaMeters2: number;
    sunshineQuantiles?: number[];
    groundAreaMeters2?: number;
  };
  roofSegmentStats: RoofSegmentStats[];
  panelCapacityWatts?: number;
  panelHeightMeters?: number;
  panelWidthMeters?: number;
  panelLifetimeYears?: number;
};

export type BuildingInsights = {
  name: string;
  center: { latitude: number; longitude: number };
  imageryDate: { year: number; month: number; day: number };
  imageryProcessedDate?: { year: number; month: number; day: number };
  postalCode?: string;
  administrativeArea?: string;
  statisticalArea?: string;
  regionCode: string;
  solarPotential: SolarPotential;
  boundingBox: {
    sw: { latitude: number; longitude: number };
    ne: { latitude: number; longitude: number };
  };
  imageryQuality: "HIGH" | "MEDIUM" | "LOW";
};

/**
 * Llama a `buildingInsights:findClosest` para una coordenada concreta.
 *
 * `quality` es el listón mínimo de imágenes aéreas para considerar el
 * resultado válido. España tiene buena cobertura en la mayoría de
 * ciudades pero zonas rurales pueden no tener MEDIUM o HIGH.
 */
export async function buildingInsights(
  lat: number,
  lon: number,
  requiredQuality: "HIGH" | "MEDIUM" | "LOW" = "LOW",
): Promise<BuildingInsights> {
  const url = new URL(BASE_URL + "/buildingInsights:findClosest");
  url.searchParams.set("location.latitude", lat.toString());
  url.searchParams.set("location.longitude", lon.toString());
  url.searchParams.set("requiredQuality", requiredQuality);
  url.searchParams.set("key", apiKey());

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Google Solar API ${res.status}: ${body.slice(0, 200)}`,
    );
  }
  return (await res.json()) as BuildingInsights;
}

/**
 * Convierte un segmento de techo de Google a un polígono rectangular
 * GeoJSON usando su boundingBox. Es una aproximación — para polígonos
 * exactos haría falta el endpoint `dataLayers:get` (raster mask) que
 * cuesta varias llamadas más.
 */
export function segmentToPolygon(seg: RoofSegmentStats): GeoJSON.Polygon {
  const { sw, ne } = seg.boundingBox;
  return {
    type: "Polygon",
    coordinates: [
      [
        [sw.longitude, sw.latitude],
        [ne.longitude, sw.latitude],
        [ne.longitude, ne.latitude],
        [sw.longitude, ne.latitude],
        [sw.longitude, sw.latitude],
      ],
    ],
  };
}
