import "server-only";

import proj4 from "proj4";
import { fromArrayBuffer } from "geotiff";

/**
 * Análisis de cubierta propio usando el LiDAR público del IGN (España).
 *
 * Es nuestra alternativa gratuita a la Google Solar API: en lugar de
 * pagar por el DSM de Google, usamos el Modelo Digital de Superficies
 * normalizado de edificación (MDS) del PNOA-LiDAR, servido por el IGN
 * vía WCS a ~2,5 m de resolución.
 *
 * Con la rejilla de alturas calculamos, con el método de Horn (estándar
 * en SIG):
 *  - pendiente (tilt) y orientación (azimut) de cada celda,
 *  - si la cubierta es plana o inclinada,
 *  - el azimut dominante y la pendiente media,
 *  - la altura del edificio,
 *  - la huella REAL del edificio (contorno de las celdas con altura),
 *    que resuelve el desfase entre Catastro y la imagen satélite.
 *
 * Cobertura: toda España peninsular + islas. Resolución 2,5 m: excelente
 * para naves industriales y comercial, orientativa en residencial pequeño.
 */

const WCS_MDS = "https://wcs-mds.idee.es/mds";
const COVERAGE = "mdsn_e025"; // MDS normalizado de edificación (~2,5 m)
const CELL_M = 2.5;

// EPSG:25830 = ETRS89 / UTM zona 30N (devuelve [E, N]). La cobertura del
// IGN usa zona 30 extendida a todo el país, así que reproyectamos siempre
// con zona 30 para ser consistentes con su rejilla.
proj4.defs(
  "EPSG:25830",
  "+proj=utm +zone=30 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
);

const toUTM = (lon: number, lat: number): [number, number] => {
  const [e, n] = proj4("EPSG:4326", "EPSG:25830", [lon, lat]);
  return [e, n];
};
const toLonLat = (e: number, n: number): [number, number] => {
  const [lon, lat] = proj4("EPSG:25830", "EPSG:4326", [e, n]);
  return [lon, lat];
};

export type RoofPlaneDetected = {
  label: string;
  tiltDeg: number;
  azimuthDeg: number;
  cellCount: number;
  fraction: number;
};

export type RoofAnalysis = {
  source: "ign-lidar";
  isPitched: boolean;
  dominantTiltDeg: number;
  dominantAzimuthDeg: number | null;
  meanTiltDeg: number;
  buildingHeightM: number;
  pitchedFraction: number;
  planes: RoofPlaneDetected[];
  footprint: GeoJSON.Polygon | null;
  footprintTouchesEdge: boolean;
  resolutionM: number;
  cellsBuilding: number;
};

const deg = (r: number) => (r * 180) / Math.PI;

/**
 * Descarga la rejilla de alturas del IGN para una caja alrededor del
 * punto (en metros UTM) y devuelve { z, originE, originN, width, height }.
 */
async function fetchMdsGrid(
  lat: number,
  lon: number,
  boxM: number,
): Promise<{
  z: number[][];
  originE: number; // E del borde oeste
  originN: number; // N del borde norte (fila 0)
  width: number;
  height: number;
}> {
  const [e, n] = toUTM(lon, lat);
  const half = boxM / 2;
  const minE = Math.round(e - half);
  const maxE = Math.round(e + half);
  const minN = Math.round(n - half);
  const maxN = Math.round(n + half);

  const url =
    `${WCS_MDS}?service=WCS&version=2.0.1&request=GetCoverage` +
    `&coverageId=${COVERAGE}` +
    `&subset=x(${minE},${maxE})&subset=y(${minN},${maxN})` +
    `&format=image/tiff`;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  let buf: ArrayBuffer;
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(t);
    if (!res.ok) {
      throw new Error(`IGN WCS HTTP ${res.status}`);
    }
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("tiff")) {
      const text = await res.text();
      throw new Error(`IGN WCS no devolvió TIFF: ${text.slice(0, 160)}`);
    }
    buf = await res.arrayBuffer();
  } finally {
    clearTimeout(t);
  }

  const tiff = await fromArrayBuffer(buf);
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();
  const rasters = await image.readRasters();
  const flat = rasters[0] as unknown as ArrayLike<number>;

  const z: number[][] = [];
  for (let r = 0; r < height; r++) {
    const row: number[] = [];
    for (let c = 0; c < width; c++) {
      let v = flat[r * width + c];
      if (!Number.isFinite(v) || v < 0 || v > 500) v = 0; // saneo nodata
      row.push(v);
    }
    z.push(row);
  }

  // Origen: la fila 0 corresponde al borde norte (maxN). Cada celda baja
  // CELL_M en N y avanza CELL_M en E.
  return { z, originE: minE, originN: maxN, width, height };
}

/** Slope + aspect (compass, 0=N) por celda interior, método de Horn. */
function slopeAspect(z: number[][], cs: number) {
  const H = z.length;
  const W = z[0].length;
  const slope: number[][] = z.map((r) => r.map(() => 0));
  const aspect: number[][] = z.map((r) => r.map(() => -1));
  for (let r = 1; r < H - 1; r++) {
    for (let c = 1; c < W - 1; c++) {
      const a = z[r - 1][c - 1],
        b = z[r - 1][c],
        cc = z[r - 1][c + 1];
      const d = z[r][c - 1],
        f = z[r][c + 1];
      const g = z[r + 1][c - 1],
        h = z[r + 1][c],
        i = z[r + 1][c + 1];
      const dzdx = (cc + 2 * f + i - (a + 2 * d + g)) / (8 * cs);
      const dzdy = (g + 2 * h + i - (a + 2 * b + cc)) / (8 * cs);
      slope[r][c] = deg(Math.atan(Math.hypot(dzdx, dzdy)));
      const asp = deg(Math.atan2(dzdy, -dzdx));
      aspect[r][c] = (90 - asp + 360) % 360;
    }
  }
  return { slope, aspect };
}

/** Media circular de ángulos (grados). */
function circularMean(anglesDeg: number[]): number {
  let sx = 0,
    sy = 0;
  for (const a of anglesDeg) {
    sx += Math.cos((a * Math.PI) / 180);
    sy += Math.sin((a * Math.PI) / 180);
  }
  return (deg(Math.atan2(sy / anglesDeg.length, sx / anglesDeg.length)) + 360) % 360;
}

/** Componente conexa (4-vecindad) que contiene el centro, sobre la máscara. */
function largestComponentAtCenter(mask: boolean[][]): boolean[][] {
  const H = mask.length;
  const W = mask[0].length;
  const out = mask.map((r) => r.map(() => false));
  const cr = Math.floor(H / 2);
  const cc = Math.floor(W / 2);

  // Si el centro no es edificio, busca la celda-edificio más cercana al centro.
  let start: [number, number] | null = mask[cr][cc] ? [cr, cc] : null;
  if (!start) {
    let bestD = Infinity;
    for (let r = 0; r < H; r++)
      for (let c = 0; c < W; c++)
        if (mask[r][c]) {
          const dd = (r - cr) ** 2 + (c - cc) ** 2;
          if (dd < bestD) {
            bestD = dd;
            start = [r, c];
          }
        }
  }
  if (!start) return out;

  const stack = [start];
  out[start[0]][start[1]] = true;
  while (stack.length) {
    const [r, c] = stack.pop()!;
    const nb: [number, number][] = [
      [r - 1, c],
      [r + 1, c],
      [r, c - 1],
      [r, c + 1],
    ];
    for (const [nr, nc] of nb) {
      if (nr < 0 || nc < 0 || nr >= H || nc >= W) continue;
      if (mask[nr][nc] && !out[nr][nc]) {
        out[nr][nc] = true;
        stack.push([nr, nc]);
      }
    }
  }
  return out;
}

/**
 * Traza el contorno exterior de una máscara binaria (Moore-neighbor
 * tracing) y devuelve los píxeles del borde en orden.
 */
function traceBoundary(mask: boolean[][]): [number, number][] {
  const H = mask.length;
  const W = mask[0].length;
  // Buscar primer píxel del borde (escaneo arriba-izquierda).
  let start: [number, number] | null = null;
  for (let r = 0; r < H && !start; r++)
    for (let c = 0; c < W; c++)
      if (mask[r][c]) {
        start = [r, c];
        break;
      }
  if (!start) return [];

  const dirs: [number, number][] = [
    [-1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
    [1, 0],
    [1, -1],
    [0, -1],
    [-1, -1],
  ];
  const inside = (r: number, c: number) =>
    r >= 0 && c >= 0 && r < H && c < W && mask[r][c];

  const contour: [number, number][] = [];
  let curr = start;
  let backtrack = 6; // venimos del oeste
  let guard = 0;
  const maxSteps = H * W * 8;
  do {
    contour.push(curr);
    let found = false;
    for (let k = 0; k < 8; k++) {
      const dir = (backtrack + 1 + k) % 8;
      const nr = curr[0] + dirs[dir][0];
      const nc = curr[1] + dirs[dir][1];
      if (inside(nr, nc)) {
        backtrack = (dir + 4) % 8;
        curr = [nr, nc];
        found = true;
        break;
      }
    }
    if (!found) break;
    guard++;
  } while (
    (curr[0] !== start[0] || curr[1] !== start[1]) &&
    guard < maxSteps
  );

  return contour;
}

export async function analyzeRoof(
  lat: number,
  lon: number,
  boxM = 200,
): Promise<RoofAnalysis> {
  const { z, originE, originN, width, height } = await fetchMdsGrid(
    lat,
    lon,
    boxM,
  );

  // Altura del edificio: usamos la mediana de las celdas claramente
  // elevadas para fijar el umbral de "es edificio".
  const heights = z.flat().filter((v) => v > 0);
  const maxH = heights.length ? Math.max(...heights) : 0;
  const threshold = Math.max(2, maxH * 0.3);

  const mask = z.map((row) => row.map((v) => v >= threshold));
  const comp = largestComponentAtCenter(mask);

  const { slope, aspect } = slopeAspect(z, CELL_M);

  // Celdas de tejado = componente del edificio, sin tocar bordes del parche.
  let cellsBuilding = 0;
  const buildingHeights: number[] = [];
  const pitchedAspect: number[] = [];
  const pitchedSlope: number[] = [];
  const roofSlope: number[] = [];
  for (let r = 1; r < height - 1; r++) {
    for (let c = 1; c < width - 1; c++) {
      if (!comp[r][c]) continue;
      cellsBuilding++;
      buildingHeights.push(z[r][c]);
      roofSlope.push(slope[r][c]);
      if (slope[r][c] > 8) {
        pitchedAspect.push(aspect[r][c]);
        pitchedSlope.push(slope[r][c]);
      }
    }
  }

  const pitchedFraction = cellsBuilding ? pitchedAspect.length / cellsBuilding : 0;
  const isPitched = pitchedFraction > 0.25;
  const meanTilt = roofSlope.length
    ? roofSlope.reduce((a, b) => a + b, 0) / roofSlope.length
    : 0;
  const dominantAzimuth =
    pitchedAspect.length >= 4 ? circularMean(pitchedAspect) : null;
  const dominantTilt = isPitched
    ? pitchedSlope.reduce((a, b) => a + b, 0) / Math.max(1, pitchedSlope.length)
    : 0;
  const buildingHeightM = buildingHeights.length
    ? median(buildingHeights)
    : 0;

  // Detectar hasta 4 orientaciones dominantes (faldones) por histograma
  // de azimut en sectores de 45°.
  const planes = detectPlanes(pitchedAspect, pitchedSlope, cellsBuilding);

  // Huella del edificio desde la elevación.
  const { polygon, touchesEdge } = buildFootprint(
    comp,
    originE,
    originN,
    width,
    height,
  );

  return {
    source: "ign-lidar",
    isPitched,
    dominantTiltDeg: Math.round(dominantTilt),
    dominantAzimuthDeg: dominantAzimuth === null ? null : Math.round(dominantAzimuth),
    meanTiltDeg: Math.round(meanTilt),
    buildingHeightM: Math.round(buildingHeightM),
    pitchedFraction: Number(pitchedFraction.toFixed(2)),
    planes,
    footprint: polygon,
    footprintTouchesEdge: touchesEdge,
    resolutionM: CELL_M,
    cellsBuilding,
  };
}

function median(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function detectPlanes(
  aspects: number[],
  slopes: number[],
  totalCells: number,
): RoofPlaneDetected[] {
  if (aspects.length < 6) return [];
  // 8 sectores de 45° (N, NE, E, SE, S, SW, W, NW).
  const sectors = new Array(8).fill(0).map(() => ({ asp: [] as number[], slp: [] as number[] }));
  for (let i = 0; i < aspects.length; i++) {
    const s = Math.floor(((aspects[i] + 22.5) % 360) / 45);
    sectors[s].asp.push(aspects[i]);
    sectors[s].slp.push(slopes[i]);
  }
  const names = ["Norte", "Noreste", "Este", "Sureste", "Sur", "Suroeste", "Oeste", "Noroeste"];
  const planes: RoofPlaneDetected[] = [];
  sectors.forEach((sec, i) => {
    if (sec.asp.length < Math.max(4, totalCells * 0.08)) return;
    planes.push({
      label: `Faldón ${names[i]}`,
      tiltDeg: Math.round(sec.slp.reduce((a, b) => a + b, 0) / sec.slp.length),
      azimuthDeg: Math.round(circularMean(sec.asp)),
      cellCount: sec.asp.length,
      fraction: Number((sec.asp.length / totalCells).toFixed(2)),
    });
  });
  return planes.sort((a, b) => b.cellCount - a.cellCount).slice(0, 4);
}

function buildFootprint(
  comp: boolean[][],
  originE: number,
  originN: number,
  width: number,
  height: number,
): { polygon: GeoJSON.Polygon | null; touchesEdge: boolean } {
  // ¿Toca el borde del parche? (footprint incompleto)
  let touchesEdge = false;
  for (let c = 0; c < width; c++) {
    if (comp[0][c] || comp[height - 1][c]) touchesEdge = true;
  }
  for (let r = 0; r < height; r++) {
    if (comp[r][0] || comp[r][width - 1]) touchesEdge = true;
  }

  const contour = traceBoundary(comp);
  if (contour.length < 4) return { polygon: null, touchesEdge };

  // Píxel (r,c) → UTM. Centro de celda: E = originE + (c+0.5)*CELL, N = originN - (r+0.5)*CELL.
  const ring: GeoJSON.Position[] = contour.map(([r, c]) => {
    const E = originE + (c + 0.5) * CELL_M;
    const N = originN - (r + 0.5) * CELL_M;
    return toLonLat(E, N);
  });
  // Cerrar el anillo.
  if (
    ring.length &&
    (ring[0][0] !== ring[ring.length - 1][0] ||
      ring[0][1] !== ring[ring.length - 1][1])
  ) {
    ring.push(ring[0]);
  }
  if (ring.length < 4) return { polygon: null, touchesEdge };

  return {
    polygon: { type: "Polygon", coordinates: [ring] },
    touchesEdge,
  };
}
