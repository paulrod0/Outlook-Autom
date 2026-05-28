import { XMLParser } from "fast-xml-parser";

/**
 * Cliente de la Sede Electrónica del Catastro (España).
 *
 * Para localizar la parcela en un punto se usa el WFS INSPIRE
 * `wfsCP.aspx` con un bbox diminuto alrededor del punto. El antiguo
 * endpoint `OVCCoordenadas.asmx` deja de responder a peticiones desde
 * funciones serverless de Vercel (probable bloqueo del WAF a `.asmx`
 * desde IPs de cloud) — el INSPIRE WFS sí responde.
 *
 * Las llamadas se hacen en servidor (Route Handlers) para:
 *  - poner User-Agent (Catastro rechaza peticiones sin UA reconocible),
 *  - cachear,
 *  - evitar CORS en el navegador.
 */

const USER_AGENT =
  "Mozilla/5.0 (compatible; EficienciaApp/0.1; +https://grupo-optimus.com)";

const WFS_INSPIRE = "https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx";
const WFS_INSPIRE_BU = "https://ovc.catastro.meh.es/INSPIRE/wfsBU.aspx";

export type CadastralParcel = {
  reference: string;
  address?: string;
  areaM2?: number;
  polygon: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  source: "catastro-wfs";
};

export type CadastralBuilding = {
  reference: string;
  polygon: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  source: "catastro-wfs-bu";
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true, // strip gml:, cp:, etc.
});

/**
 * Localiza la parcela catastral en un punto (lat, lon).
 *
 * Implementado con WFS GetFeature + bbox diminuto en lugar del antiguo
 * OVCCoordenadas.asmx (que está bloqueado para tráfico de Vercel). La
 * misma llamada nos devuelve refcat + geometría, así que también
 * exponemos `parcelByPoint` para flujos que quieran ahorrarse la
 * segunda llamada a `parcelByRef`.
 */
export async function refByPoint(
  lat: number,
  lon: number,
): Promise<{ reference: string; address?: string } | null> {
  const parcel = await parcelByPoint(lat, lon);
  return parcel ? { reference: parcel.reference } : null;
}

export async function parcelByPoint(
  lat: number,
  lon: number,
): Promise<CadastralParcel | null> {
  // Bbox de ~3 m alrededor del punto (1e-5 grados ≈ 1 m).
  const delta = 1.5e-5;
  const lat1 = lat - delta;
  const lon1 = lon - delta;
  const lat2 = lat + delta;
  const lon2 = lon + delta;

  const url = new URL(WFS_INSPIRE);
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "2.0.0");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("typenames", "cp:CadastralParcel");
  url.searchParams.set("srsname", "EPSG:4326");
  // bbox en orden lat,lon (axis order de EPSG:4326 en WFS 2.0).
  url.searchParams.set(
    "bbox",
    `${lat1},${lon1},${lat2},${lon2},urn:ogc:def:crs:EPSG::4326`,
  );

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/xml" },
  });
  if (!res.ok) return null;

  const xml = await res.text();
  const doc = parser.parse(xml) as FeatureCollectionDoc;
  const members = ensureArray(doc?.FeatureCollection?.member);
  if (members.length === 0) return null;

  for (const m of members) {
    const cp = m?.CadastralParcel;
    if (!cp) continue;
    const ref = extractRefcat(cp);
    if (!ref) continue;
    const polygon = gmlMultiSurfaceToGeoJson(cp.geometry?.MultiSurface);
    if (!polygon) continue;
    const areaM2 = numberOrUndefined(extractAreaValue(cp.areaValue));
    return {
      reference: ref,
      areaM2,
      polygon,
      source: "catastro-wfs",
    };
  }
  return null;
}

function extractRefcat(cp: CadastralParcelNode): string | undefined {
  const ncr = cp.nationalCadastralReference;
  if (typeof ncr === "string") return ncr.trim();
  if (ncr && typeof ncr === "object" && "#text" in ncr) {
    return String(ncr["#text"]).trim();
  }
  // Fallback: extraer del gml:id (ES.SDGC.CP.{refcat}).
  const id = cp["@_gml:id"] ?? cp["@_id"];
  if (id) {
    const m = String(id).match(/(?:ES\.SDGC\.CP\.)?([0-9A-Z]{14,20})/);
    if (m) return m[1];
  }
  return undefined;
}

export async function parcelByRef(
  reference: string,
): Promise<CadastralParcel | null> {
  const clean = reference.replace(/\s+/g, "").toUpperCase();
  if (!/^[0-9A-Z]{14,20}$/.test(clean)) {
    throw new Error("Referencia catastral no válida (esperado 14-20 caracteres)");
  }

  const refParcel = clean.slice(0, 14);

  const url = new URL(WFS_INSPIRE);
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "2.0.0");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("STOREDQUERIE_ID", "GetParcel");
  url.searchParams.set("srsname", "EPSG:4326");
  url.searchParams.set("refcat", refParcel);

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/xml" },
  });
  if (!res.ok) return null;

  const xml = await res.text();
  const doc = parser.parse(xml) as FeatureCollectionDoc;

  const members = ensureArray(doc?.FeatureCollection?.member);
  const parcel = members.find((m) => m?.CadastralParcel)?.CadastralParcel;
  if (!parcel) return null;

  const areaM2 = numberOrUndefined(extractAreaValue(parcel.areaValue));

  const polygon = gmlMultiSurfaceToGeoJson(parcel.geometry?.MultiSurface);
  if (!polygon) return null;

  return {
    reference: refParcel,
    areaM2,
    polygon,
    source: "catastro-wfs",
  };
}

export async function buildingByRef(
  reference: string,
): Promise<CadastralBuilding | null> {
  const clean = reference.replace(/\s+/g, "").toUpperCase();
  if (!/^[0-9A-Z]{14,20}$/.test(clean)) {
    throw new Error("Referencia catastral no válida (esperado 14-20 caracteres)");
  }
  const refParcel = clean.slice(0, 14);

  const url = new URL(WFS_INSPIRE_BU);
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "2.0.0");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("STOREDQUERIE_ID", "GetBuildingByParcel");
  url.searchParams.set("srsname", "EPSG:4326");
  url.searchParams.set("refcat", refParcel);

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/xml" },
  });
  if (!res.ok) return null;

  const xml = await res.text();
  const doc = parser.parse(xml) as BuildingFeatureCollectionDoc;

  // El WFS BU envuelve cada edificio en <gml:featureMember>, distinto de
  // <wfs:member> del WFS CP. Tras quitar prefijos: featureMember.Building.
  const members = ensureArray(doc?.FeatureCollection?.featureMember);
  const buildings: BuildingNode[] = [];
  for (const m of members) {
    if (m?.Building) buildings.push(m.Building);
  }
  if (buildings.length === 0) return null;

  const polygons: GeoJSON.Position[][][] = [];

  for (const b of buildings) {
    // Path real del WFS BU:
    //   Building > geometry > BuildingGeometry > geometry > Surface
    //     > patches > PolygonPatch > exterior > LinearRing > posList
    const surface = b?.geometry?.BuildingGeometry?.geometry?.Surface;
    if (!surface) continue;

    const patches = ensureArray(surface.patches?.PolygonPatch);
    for (const patch of patches) {
      const outer = posListToRing(patch.exterior?.LinearRing?.posList);
      if (!outer) continue;
      const rings: GeoJSON.Position[][] = [outer];
      for (const interior of ensureArray(patch.interior)) {
        const inner = posListToRing(interior.LinearRing?.posList);
        if (inner) rings.push(inner);
      }
      polygons.push(rings);
    }

    // Algunos sitios urbanos antiguos emiten posList directo dentro de Surface.
    if (patches.length === 0 && surface.posList) {
      const ring = posListToRing(surface.posList);
      if (ring) polygons.push([ring]);
    }
  }

  if (polygons.length === 0) return null;

  const polygon: GeoJSON.Polygon | GeoJSON.MultiPolygon =
    polygons.length === 1
      ? { type: "Polygon", coordinates: polygons[0] }
      : { type: "MultiPolygon", coordinates: polygons };

  return { reference: refParcel, polygon, source: "catastro-wfs-bu" };
}

/**
 * Convierte un gml:MultiSurface (eje lat,lon en EPSG:4326 según WFS 2.0)
 * a un GeoJSON Polygon o MultiPolygon (eje lon,lat).
 */
function gmlMultiSurfaceToGeoJson(
  surface: MultiSurfaceNode | undefined,
): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  if (!surface) return null;

  const surfaceMembers = ensureArray(surface.surfaceMember);
  const polygons: GeoJSON.Position[][][] = [];

  for (const member of surfaceMembers) {
    // INSPIRE WFS de Catastro emite gml:Surface con patches/PolygonPatch.
    // Algunas variantes pueden emitir directamente gml:Polygon (Surface = null).
    const patches = ensureArray(
      member.Surface?.patches?.PolygonPatch ?? member.Polygon,
    );

    for (const patch of patches) {
      if (!patch) continue;
      const outer = posListToRing(patch.exterior?.LinearRing?.posList);
      if (!outer) continue;

      const rings: GeoJSON.Position[][] = [outer];
      for (const interior of ensureArray(patch.interior)) {
        const ring = posListToRing(interior.LinearRing?.posList);
        if (ring) rings.push(ring);
      }
      polygons.push(rings);
    }
  }

  if (polygons.length === 0) return null;
  if (polygons.length === 1) {
    return { type: "Polygon", coordinates: polygons[0] };
  }
  return { type: "MultiPolygon", coordinates: polygons };
}

function posListToRing(
  posList: PosListNode | undefined,
): GeoJSON.Position[] | null {
  if (!posList) return null;
  const text =
    typeof posList === "string" ? posList : (posList["#text"] ?? "");
  if (!text) return null;

  const numbers = text
    .trim()
    .split(/\s+/)
    .map((n) => parseFloat(n))
    .filter((n) => Number.isFinite(n));

  if (numbers.length < 6 || numbers.length % 2 !== 0) return null;

  const ring: GeoJSON.Position[] = [];
  for (let i = 0; i < numbers.length; i += 2) {
    // WFS 2.0 EPSG:4326 → axis order lat, lon. GeoJSON wants lon, lat.
    const lat = numbers[i];
    const lon = numbers[i + 1];
    ring.push([lon, lat]);
  }
  return ring;
}

function extractAreaValue(
  value:
    | { "#text"?: string | number }
    | string
    | number
    | undefined,
): string | number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string" || typeof value === "number") return value;
  return value["#text"];
}

function ensureArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function numberOrUndefined(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : undefined;
}

// --- Tipos crudos del parser (no exhaustivos, sólo lo que usamos) ---

type FeatureCollectionDoc = {
  FeatureCollection?: {
    member?: FeatureCollectionMember | FeatureCollectionMember[];
  };
};

type FeatureCollectionMember = {
  CadastralParcel?: CadastralParcelNode;
};

type CadastralParcelNode = {
  areaValue?: { "#text"?: string | number } | string | number;
  geometry?: { MultiSurface?: MultiSurfaceNode };
  nationalCadastralReference?: string | { "#text"?: string };
  "@_gml:id"?: string;
  "@_id"?: string;
};

type PosListNode = string | { "#text"?: string };

type MultiSurfaceNode = {
  surfaceMember?: SurfaceMember | SurfaceMember[];
};

type SurfaceMember = {
  Surface?: {
    patches?: { PolygonPatch?: PolygonPatchNode | PolygonPatchNode[] };
  };
  Polygon?: PolygonPatchNode; // fallback si el WFS emite gml:Polygon directo
};

type PolygonPatchNode = {
  exterior?: { LinearRing?: { posList?: PosListNode } };
  interior?: InteriorNode | InteriorNode[];
};

type InteriorNode = { LinearRing?: { posList?: PosListNode } };

type BuildingFeatureCollectionDoc = {
  FeatureCollection?: {
    featureMember?: FeatureMemberNode | FeatureMemberNode[];
  };
};

type FeatureMemberNode = {
  Building?: BuildingNode;
};

type BuildingNode = {
  geometry?: {
    BuildingGeometry?: {
      geometry?: {
        Surface?: {
          posList?: PosListNode;
          patches?: { PolygonPatch?: PolygonPatchNode | PolygonPatchNode[] };
        };
      };
    };
  };
};
