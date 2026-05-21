/**
 * Cliente de la Sede Electrónica del Catastro (España).
 *
 * Servicios usados:
 *  - OVCCoordenadas.asmx/Consulta_RCCOOR — dada (x, y, srs) devuelve la
 *    referencia catastral del inmueble en ese punto.
 *  - OVCCallejero.asmx/Consulta_DNPRC — dada una referencia catastral
 *    devuelve los datos del inmueble (incluido inmueble urbano: superficie,
 *    uso, año de construcción, etc.).
 *  - WFS de Catastro (Inspire) — devuelve el polígono geográfico de la
 *    parcela en GML/GeoJSON: https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx
 *
 * Se implementa completo en M1. Aquí dejo el contrato de tipos y un stub
 * para que el resto de la app pueda tipar contra él.
 */

export type CadastralParcel = {
  reference: string;
  address?: string;
  areaM2?: number;
  polygonGeoJson: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  source: "catastro-wfs" | "catastro-ovc";
};

export async function getParcelByReference(
  _reference: string,
): Promise<CadastralParcel | null> {
  throw new Error("getParcelByReference: implementación pendiente (M1)");
}

export async function getParcelByPoint(
  _lat: number,
  _lon: number,
): Promise<CadastralParcel | null> {
  throw new Error("getParcelByPoint: implementación pendiente (M1)");
}
