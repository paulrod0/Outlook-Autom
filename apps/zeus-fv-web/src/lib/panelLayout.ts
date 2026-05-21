/**
 * Algoritmo de empaquetado de paneles sobre un polígono de cubierta.
 *
 * Contrato definido aquí; implementación en M2 con Turf.js + proj4.
 * Ver §6 de docs/ARQUITECTURA.md para el pseudocódigo completo.
 */

export type PanelModel = {
  manufacturer: string;
  model: string;
  peakWp: number;
  widthM: number;
  heightM: number;
};

export type LayoutInput = {
  polygon: GeoJSON.Polygon; // EPSG:4326, lon/lat
  panel: PanelModel;
  tiltDeg: number;
  azimuthDeg: number; // 180 = Sur
  edgeMarginM: number; // margen interior
  rowSpacingM?: number; // si no se especifica, se calcula por sombras
  maxKw?: number; // límite por referencia catastral (130 kW)
};

export type LayoutResult = {
  panelCount: number;
  peakPowerKwp: number;
  panels: GeoJSON.Feature<GeoJSON.Polygon>[]; // un feature por panel
  usableAreaM2: number;
};

export function computeLayout(_input: LayoutInput): LayoutResult {
  throw new Error("computeLayout: implementación pendiente (M2)");
}

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
