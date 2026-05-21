import { XMLParser } from "fast-xml-parser";

/**
 * Cliente de la Sede Electrónica del Catastro (España).
 *
 * Servicios:
 *  - OVCCoordenadas.asmx/Consulta_RCCOOR
 *      (x, y, SRS) → referencia catastral del inmueble en ese punto.
 *  - WFS INSPIRE Cadastral Parcels
 *      refcat → polígono y superficie de la parcela.
 *
 * Las llamadas se hacen en servidor (Route Handlers) para:
 *  - poner User-Agent (Catastro rechaza peticiones sin UA reconocible),
 *  - cachear,
 *  - evitar CORS en el navegador.
 */

const USER_AGENT =
  "Mozilla/5.0 (compatible; ZeusFVApp/0.1; +https://zeusenergia.com)";

const OVC_COORDENADAS =
  "https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/Consulta_RCCOOR";

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

export async function refByPoint(
  lat: number,
  lon: number,
): Promise<{ reference: string; address?: string } | null> {
  const url = new URL(OVC_COORDENADAS);
  url.searchParams.set("Coordenada_X", lon.toString());
  url.searchParams.set("Coordenada_Y", lat.toString());
  url.searchParams.set("SRS", "EPSG:4326");

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/xml" },
  });
  if (!res.ok) return null;

  const xml = await res.text();
  const doc = parser.parse(xml) as ConsultaCoordenadasDoc;

  const coord = doc?.consulta_coordenadas?.coordenadas?.coord;
  if (!coord) return null;

  const pc1 = coord.pc?.pc1;
  const pc2 = coord.pc?.pc2;
  if (!pc1 || !pc2) return null;

  return {
    reference: `${pc1}${pc2}`,
    address: coord.ldt,
  };
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

  const member = doc?.FeatureCollection?.member;
  if (!member) return null;

  const parcel = member.CadastralParcel;
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

type ConsultaCoordenadasDoc = {
  consulta_coordenadas?: {
    coordenadas?: {
      coord?: {
        pc?: { pc1?: string; pc2?: string };
        ldt?: string;
      };
    };
  };
};

type FeatureCollectionDoc = {
  FeatureCollection?: {
    member?: {
      CadastralParcel?: {
        areaValue?: { "#text"?: string | number } | string | number;
        geometry?: { MultiSurface?: MultiSurfaceNode };
      };
    };
  };
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
