import * as turf from "@turf/turf";
import proj4 from "proj4";

/**
 * Empaquetado de paneles sobre un polígono de cubierta.
 *
 * Pasos:
 *  1. Reproyectar el polígono de EPSG:4326 a la zona UTM ETRS89 local
 *     (proyección métrica adecuada para España peninsular y Canarias).
 *  2. Aplicar buffer interior de seguridad (`edgeMarginM`).
 *  3. Calcular separación entre filas si no se pasa explícita, usando
 *     la altura solar del 21 de diciembre a las 12h solares para la
 *     latitud del centroide (regla habitual para evitar sombras entre filas).
 *  4. Generar un grid de paneles alineado con el azimut. Cada panel es un
 *     rectángulo de `panel.widthM × panel.heightM`.
 *  5. Filtrar paneles cuyo rectángulo completo no está contenido en el
 *     polígono útil (con tolerancia mínima por errores de coma flotante).
 *  6. Aplicar opcionalmente un límite de potencia (130 kWp por referencia
 *     catastral en Fase 1).
 *
 * El resultado se devuelve en EPSG:4326 (GeoJSON) listo para pintar en el mapa.
 */

export type PanelModel = {
  manufacturer: string;
  model: string;
  peakWp: number;
  widthM: number;  // dimensión "corta" del panel
  heightM: number; // dimensión "larga" del panel
};

export type LayoutInput = {
  polygon: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  panel: PanelModel;
  tiltDeg: number;
  azimuthDeg: number;
  edgeMarginM: number;
  rowSpacingM?: number;
  /** Separación adicional entre columnas (m). Default 0 = paneles pegados. */
  columnGapM?: number;
  maxKwp?: number;
  /** Obstáculos a respetar (skylights, HVAC, chimeneas). */
  obstacles?: GeoJSON.Polygon[];
  /**
   * Lado de la agrupación de paneles antes de un pasillo cortafuegos.
   * RSCIEI (RD 164/2025): instalaciones con lado > 45 m se dividen en
   * agrupaciones de máx. 45 × 45 m. Si se omite, se usa 45 m para
   * instalaciones > 500 m² y se desactiva en doméstico.
   */
  aisleBlockSideM?: number;
  /** Ancho del pasillo cortafuegos (m). RSCIEI: ≥ 1,2 m. Default 1,2 m. */
  aisleWidthM?: number;
};

export type LayoutResult = {
  panelCount: number;
  peakPowerKwp: number;
  panels: GeoJSON.Feature<GeoJSON.Polygon>[];
  usableAreaM2: number;
  rowSpacingM: number;
  gridRotationDeg: number; // rotación aplicada al grid (0 = E-W)
};

export const DEFAULT_PANELS: PanelModel[] = [
  {
    manufacturer: "LONGi",
    model: "LR5-72HBD-580M",
    peakWp: 580,
    widthM: 1.134,
    heightM: 2.278,
  },
  {
    manufacturer: "JA Solar",
    model: "JAM72D40-585GB",
    peakWp: 585,
    widthM: 1.134,
    heightM: 2.278,
  },
  {
    manufacturer: "Trina Solar",
    model: "Vertex TSM-NEG21C.20 720W",
    peakWp: 720,
    widthM: 1.303,
    heightM: 2.382,
  },
];

const deg2rad = (d: number) => (d * Math.PI) / 180;
const rad2deg = (r: number) => (r * 180) / Math.PI;

/** Define las proyecciones UTM ETRS89 sobre la marcha si no están en proj4. */
function ensureUtmDef(zone: number, isNorth: boolean) {
  const code = `EPSG:${isNorth ? 25800 + zone : 32700 + zone}`;
  if (!proj4.defs(code)) {
    const south = isNorth ? "" : " +south";
    proj4.defs(
      code,
      `+proj=utm +zone=${zone} +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs${south}`,
    );
  }
  return code;
}

function pickUtmZone(lon: number, lat: number): string {
  const zone = Math.floor((lon + 180) / 6) + 1;
  return ensureUtmDef(zone, lat >= 0);
}

/**
 * Distancia mínima entre filas (de borde anterior a borde anterior) para
 * que la sombra del panel a las 12h solares del solsticio de invierno no
 * llegue a la base del panel siguiente.
 *
 *   altura_solar = 90 - lat - 23.44
 *   d = h_panel * (cos(tilt) + sin(tilt) / tan(altura_solar))
 *
 * h_panel es la altura vertical efectiva del panel inclinado.
 */
function computeRowSpacing(latitudeDeg: number, panelHeightM: number, tiltDeg: number) {
  const lat = Math.max(0, Math.min(60, Math.abs(latitudeDeg)));
  const winterSolarAltitude = Math.max(5, 90 - lat - 23.44);
  const t = deg2rad(tiltDeg);
  const a = deg2rad(winterSolarAltitude);
  return panelHeightM * (Math.cos(t) + Math.sin(t) / Math.tan(a));
}

export function computeLayout(input: LayoutInput): LayoutResult {
  const { polygon, panel, tiltDeg, edgeMarginM, maxKwp } = input;

  // 1) Centroide y elección de zona UTM para trabajar en metros.
  const centroidFeature = turf.centroid(turf.feature(polygon));
  const [lonC, latC] = centroidFeature.geometry.coordinates;
  const utm = pickUtmZone(lonC, latC);

  // 2a) Apertura morfológica: -kernel + +kernel elimina apéndices estrechos
  //     (canopies, pasarelas, voladizos) que Catastro registra como parte
  //     del edificio pero no son cubierta utilizable para FV. Para polígonos
  //     pequeños (doméstico) el kernel se reduce para no comerse el chalet.
  const polygonArea = turf.area(turf.feature(polygon));
  const morphKernel =
    polygonArea > 20000 ? 2.5 :
    polygonArea > 5000 ? 1.5 :
    polygonArea > 500 ? 0.5 :
    0; // desactivado en doméstico
  let cleaned: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> =
    turf.feature(polygon);
  if (morphKernel > 0) {
    const shrunk = turf.buffer(cleaned, -morphKernel, { units: "meters" });
    if (shrunk && shrunk.geometry) {
      const reopened = turf.buffer(shrunk, morphKernel, { units: "meters" });
      if (reopened && reopened.geometry) {
        cleaned = reopened as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
      }
    }
  }

  // 2b) Franja perimetral libre (RSCIEI, RD 164/2025): obligatoria ≥ 1 m
  //     cuando la instalación supera 500 m². Por debajo (residencial)
  //     basta con el margen que pida el usuario (mín. 0,5 m práctico).
  const minEdgeForScale = polygonArea > 500 ? 1.0 : 0.5;
  const effectiveEdge = Math.max(Math.abs(edgeMarginM), minEdgeForScale);

  // 2c) Buffer interior con el margen efectivo.
  let buffered = turf.buffer(cleaned, -effectiveEdge, { units: "meters" });
  if (!buffered || !buffered.geometry) return emptyResult();

  // 2d) Restar obstáculos (skylights, HVAC, chimeneas) al polígono útil.
  for (const obstacle of input.obstacles ?? []) {
    try {
      const padded = turf.buffer(turf.feature(obstacle), 0.3, {
        units: "meters",
      });
      if (!padded) continue;
      const diff = turf.difference(
        turf.featureCollection([
          buffered as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
          padded as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
        ]),
      );
      if (diff && diff.geometry) {
        buffered = diff as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
      }
    } catch {
      // si falla, continuamos sin restar ese obstáculo concreto
    }
  }

  const usableLngLat = buffered.geometry as
    | GeoJSON.Polygon
    | GeoJSON.MultiPolygon;
  if (usableLngLat.type !== "Polygon" && usableLngLat.type !== "MultiPolygon") {
    return emptyResult();
  }
  const usableAreaM2 = turf.area(buffered);
  if (usableAreaM2 <= 0) return emptyResult();

  // 3) Reproyectar polígono útil a UTM.
  const usableUtm = reprojectPolygon(usableLngLat, "EPSG:4326", utm);

  // 4) Separación entre filas (regla solsticio invierno) en metros.
  const rowSpacing =
    input.rowSpacingM && input.rowSpacingM > 0
      ? input.rowSpacingM
      : computeRowSpacing(latC, panel.heightM, tiltDeg);

  const columnGap = Math.max(0, input.columnGapM ?? 0);
  const stepX = panel.widthM + columnGap;
  const stepY = rowSpacing;

  // 5) Centro fijo en UTM sobre el que rotamos el grid.
  const [utmMinX, utmMinY, utmMaxX, utmMaxY] = bboxOfUtmGeom(usableUtm);
  const cx = (utmMinX + utmMaxX) / 2;
  const cy = (utmMinY + utmMaxY) / 2;

  // 5b) Agrupaciones con pasillo cortafuegos (RSCIEI, RD 164/2025):
  //     instalaciones cuyo lado supere 45 m deben dividirse en agrupaciones
  //     de máx. 45 × 45 m separadas por franjas de ≥ 1,2 m. Activamos los
  //     bloques de 45 m para cualquier instalación > 500 m² (las pequeñas
  //     caben en un bloque y no muestran pasillos). En doméstico, off.
  const aisleBlockSide =
    input.aisleBlockSideM ?? (polygonArea > 500 ? 45 : 0);
  const aisleWidth = input.aisleWidthM ?? 1.2;

  // 6) Búsqueda: probar rotaciones cada 5° en [0°, 90°) (más allá repite),
  //    y para cada rotación varios offsets pequeños. Nos quedamos con la
  //    combinación que coloque más paneles.
  const rotationCandidates: number[] = [];
  for (let a = 0; a < 90; a += 5) rotationCandidates.push(a);

  let bestPanels: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
  let bestRotation = 0;

  for (const rotationDeg of rotationCandidates) {
    const theta = deg2rad(rotationDeg);
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);

    // Bounding box del polígono expresado en el frame local del grid
    // (rotado -theta respecto a UTM, con origen en (cx,cy)). Acota el barrido.
    const [umin, vmin, umax, vmax] = bboxInLocalFrame(usableUtm, cx, cy, theta);

    for (let dy = 0; dy < stepY; dy += stepY / 3) {
      for (let dx = 0; dx < stepX; dx += stepX / 2) {
        const panels = generateGrid(
          usableUtm,
          panel,
          umin + dx,
          vmin + dy,
          umax,
          vmax,
          stepX,
          stepY,
          cos,
          sin,
          cx,
          cy,
          aisleBlockSide,
          aisleWidth,
        );
        if (panels.length > bestPanels.length) {
          bestPanels = panels;
          bestRotation = rotationDeg;
        }
      }
    }
  }

  // 7) Reproyectar paneles UTM → lon/lat para el render.
  const panelsLngLat = bestPanels.map((f) =>
    reprojectFeature(f, utm, "EPSG:4326"),
  );

  let limited = panelsLngLat;
  if (maxKwp && maxKwp > 0) {
    const maxPanels = Math.floor((maxKwp * 1000) / panel.peakWp);
    if (limited.length > maxPanels) limited = limited.slice(0, maxPanels);
  }

  const peakPowerKwp = (limited.length * panel.peakWp) / 1000;

  return {
    panelCount: limited.length,
    peakPowerKwp: Number(peakPowerKwp.toFixed(2)),
    panels: limited,
    usableAreaM2: Number(usableAreaM2.toFixed(1)),
    rowSpacingM: Number(rowSpacing.toFixed(2)),
    gridRotationDeg: bestRotation,
  };
}

function generateGrid(
  usableUtm: GeoJSON.Polygon | GeoJSON.MultiPolygon,
  panel: PanelModel,
  uStart: number,
  vStart: number,
  uEnd: number,
  vEnd: number,
  stepX: number,
  stepY: number,
  cos: number,
  sin: number,
  cx: number,
  cy: number,
  aisleBlockSideM: number,
  aisleWidthM: number,
): GeoJSON.Feature<GeoJSON.Polygon>[] {
  const panels: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
  // Origen del grid en coords locales (u, v) = (uStart, vStart).
  // Definimos bloques de aisleBlockSideM × aisleBlockSideM con pasillo
  // cortafuegos al final de cada bloque (en U y en V).
  // Si aisleBlockSideM <= 0 → bloques desactivados (doméstico).
  const useBlocks = aisleBlockSideM > 0;
  for (let v = vStart; v <= vEnd; v += stepY) {
    if (useBlocks) {
      const vOffset = v - vStart;
      const positionInBlockV = vOffset - Math.floor(vOffset / aisleBlockSideM) * aisleBlockSideM;
      if (positionInBlockV + panel.heightM > aisleBlockSideM - aisleWidthM) {
        continue; // panel quedaría dentro del pasillo en V
      }
    }
    for (let u = uStart; u <= uEnd; u += stepX) {
      if (useBlocks) {
        const uOffset = u - uStart;
        const positionInBlockU = uOffset - Math.floor(uOffset / aisleBlockSideM) * aisleBlockSideM;
        if (positionInBlockU + panel.widthM > aisleBlockSideM - aisleWidthM) {
          continue; // panel quedaría dentro del pasillo en U
        }
      }
      const rect = panelRectangleAt(
        u,
        v,
        panel.widthM,
        panel.heightM,
        cos,
        sin,
        cx,
        cy,
      );
      if (allCornersInside(rect, usableUtm)) {
        panels.push(turf.polygon([rect]));
      }
    }
  }
  return panels;
}

/**
 * Devuelve el bbox del polígono expresado en un frame local: trasladado a
 * (cx,cy) y rotado por -theta. Acota el barrido del grid en coords (u,v).
 */
function bboxInLocalFrame(
  g: GeoJSON.Polygon | GeoJSON.MultiPolygon,
  cx: number,
  cy: number,
  theta: number,
): [number, number, number, number] {
  // local = R(-theta) · (utm - (cx,cy))
  // R(-theta) = [[cos, sin], [-sin, cos]]
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  let umin = Infinity,
    vmin = Infinity,
    umax = -Infinity,
    vmax = -Infinity;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  for (const poly of polys) {
    for (const ring of poly) {
      for (const [x, y] of ring) {
        const dx = x - cx;
        const dy = y - cy;
        const u = dx * cos + dy * sin;
        const v = -dx * sin + dy * cos;
        if (u < umin) umin = u;
        if (v < vmin) vmin = v;
        if (u > umax) umax = u;
        if (v > vmax) vmax = v;
      }
    }
  }
  return [umin, vmin, umax, vmax];
}

function bboxOfUtmGeom(
  g: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): [number, number, number, number] {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  for (const poly of polys) {
    for (const ring of poly) {
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  return [minX, minY, maxX, maxY];
}

function panelRectangleAt(
  u: number,
  v: number,
  w: number,
  h: number,
  cos: number,
  sin: number,
  cx: number,
  cy: number,
): GeoJSON.Position[] {
  const corners: Array<[number, number]> = [
    [u, v],
    [u + w, v],
    [u + w, v + h],
    [u, v + h],
    [u, v],
  ];
  return corners.map(([x, y]) => {
    const xr = x * cos - y * sin + cx;
    const yr = x * sin + y * cos + cy;
    return [xr, yr];
  });
}

function allCornersInside(
  ring: GeoJSON.Position[],
  poly: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): boolean {
  for (let i = 0; i < 4; i++) {
    const [x, y] = ring[i];
    if (!turf.booleanPointInPolygon(turf.point([x, y]), turf.feature(poly))) {
      return false;
    }
  }
  return true;
}

function emptyResult(): LayoutResult {
  return {
    panelCount: 0,
    peakPowerKwp: 0,
    panels: [],
    usableAreaM2: 0,
    rowSpacingM: 0,
    gridRotationDeg: 0,
  };
}

function reprojectPolygon(
  geom: GeoJSON.Polygon | GeoJSON.MultiPolygon,
  from: string,
  to: string,
): GeoJSON.Polygon | GeoJSON.MultiPolygon {
  const project = (c: GeoJSON.Position): GeoJSON.Position => {
    const [x, y] = proj4(from, to, [c[0], c[1]]);
    return [x, y];
  };

  if (geom.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: geom.coordinates.map((ring) => ring.map(project)),
    };
  }
  return {
    type: "MultiPolygon",
    coordinates: geom.coordinates.map((poly) =>
      poly.map((ring) => ring.map(project)),
    ),
  };
}

function reprojectFeature(
  f: GeoJSON.Feature<GeoJSON.Polygon>,
  from: string,
  to: string,
): GeoJSON.Feature<GeoJSON.Polygon> {
  return {
    ...f,
    geometry: reprojectPolygon(f.geometry, from, to) as GeoJSON.Polygon,
  };
}

// Suprime el warning sobre `rad2deg` por si no se usa en cambios futuros.
void rad2deg;
