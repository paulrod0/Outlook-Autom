/**
 * Parser heurístico de facturas eléctricas españolas.
 *
 * Las facturas no tienen un formato estándar — cada comercializadora
 * (Iberdrola, Endesa, Naturgy, EDP, Repsol, Holaluz, TotalEnergies, etc.)
 * usa una maquetación distinta. Extraemos los campos con patrones
 * regex generosos sobre el texto plano del PDF.
 *
 * Funciona con PDFs basados en texto. Para escaneados haría falta OCR
 * (Tesseract / Azure Form Recognizer), fuera del MVP.
 *
 * Campos que intentamos extraer:
 *   - CUPS (20-22 caracteres, empieza por ES)
 *   - Tarifa de acceso (2.0TD, 3.0TD, 6.1TD, ...)
 *   - Potencias contratadas (kW) por periodo
 *   - Consumo total del periodo facturado (kWh)
 *   - Fechas del periodo facturado → estimación de consumo anual
 *   - Importe total (€)
 *   - Dirección de suministro
 */

import { extractText, getDocumentProxy } from "unpdf";

export type BillData = {
  cups?: string;
  tariff?: string;
  contractedPowerKw?: number[]; // un valor por periodo (P1..Pn)
  periodConsumptionKwh?: number; // consumo del periodo facturado
  periodStart?: string; // ISO
  periodEnd?: string; // ISO
  estimatedAnnualKwh?: number; // extrapolado a 365 días
  totalEur?: number;
  supplyAddress?: string;
  rawTextSample?: string; // primeros 500 chars para depurar
};

const CUPS_RE = /\bES\d{16}[A-Z0-9]{2}(?:\d[A-Z])?\b/i;
const TARIFF_RE = /\b([23]\.0\s*TD|6\.[1-4]\s*TD|2\.1\s*TD)\b/i;
const NUMBER_RE = /-?\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?|-?\d+(?:[.,]\d+)?/;
const DATE_RE = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/g;

function toNumber(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "");
  const normalized = cleaned.replace(",", ".");
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : undefined;
}

function parseDateDMY(d: string, m: string, y: string): Date | null {
  let yi = parseInt(y, 10);
  if (yi < 100) yi += 2000;
  const date = new Date(Date.UTC(yi, parseInt(m, 10) - 1, parseInt(d, 10)));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function findCups(text: string): string | undefined {
  const m = CUPS_RE.exec(text);
  return m ? m[0].toUpperCase().replace(/\s/g, "") : undefined;
}

function findTariff(text: string): string | undefined {
  const m = TARIFF_RE.exec(text);
  return m ? m[1].toUpperCase().replace(/\s/g, "") : undefined;
}

function findContractedPower(text: string): number[] | undefined {
  // Buscamos un bloque tipo "Potencia contratada" + lista de números en kW.
  const idx = text.search(/Potencia\s+contratada/i);
  if (idx < 0) return undefined;
  const slice = text.slice(idx, idx + 800);
  const nums: number[] = [];
  const re = new RegExp(`(${NUMBER_RE.source})\\s*kW(?!h|[a-z])`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(slice)) !== null) {
    const v = toNumber(m[1]);
    if (v !== undefined && v > 0 && v < 1500) nums.push(v);
    if (nums.length >= 6) break;
  }
  return nums.length ? nums : undefined;
}

function findConsumption(text: string): number | undefined {
  // 1) "Consumo total ... 1.234 kWh"
  let re = /Consumo\s*(?:total|del?\s*periodo)?[^\d]{0,40}(-?\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?)\s*kWh/i;
  let m = text.match(re);
  if (m) {
    const v = toNumber(m[1]);
    if (v !== undefined && v > 0) return v;
  }
  // 2) "Energía consumida 1.234 kWh"
  re = /Energ[ií]a\s+consumida[^\d]{0,40}(-?\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?)\s*kWh/i;
  m = text.match(re);
  if (m) {
    const v = toNumber(m[1]);
    if (v !== undefined && v > 0) return v;
  }
  // 3) Si hay varios consumos por periodo (P1, P2, ...), sumarlos.
  const sumRe = /\bP[1-6]\b[^\d]{0,40}(-?\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?)\s*kWh/gi;
  let total = 0;
  let count = 0;
  let mm: RegExpExecArray | null;
  while ((mm = sumRe.exec(text)) !== null) {
    const v = toNumber(mm[1]);
    if (v !== undefined && v >= 0) {
      total += v;
      count++;
    }
  }
  if (count >= 2 && total > 0) return total;
  return undefined;
}

function findPeriod(text: string): { start?: Date; end?: Date } {
  // "Periodo de facturación: del DD/MM/YYYY al DD/MM/YYYY"
  const m = text.match(
    /(?:Periodo|Per[ií]odo)\s*(?:de\s*facturaci[oó]n)?[\s:]*(?:del?\s*)?(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\s*(?:al?|a|\-|hasta)\s*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/i,
  );
  if (m) {
    const start = parseDateDMY(m[1], m[2], m[3]);
    const end = parseDateDMY(m[4], m[5], m[6]);
    if (start && end) return { start, end };
  }
  // Fallback: las dos primeras fechas que aparezcan en orden creciente.
  DATE_RE.lastIndex = 0;
  const dates: Date[] = [];
  let mm: RegExpExecArray | null;
  while ((mm = DATE_RE.exec(text)) !== null) {
    const d = parseDateDMY(mm[1], mm[2], mm[3]);
    if (d) dates.push(d);
    if (dates.length > 20) break;
  }
  if (dates.length >= 2) {
    dates.sort((a, b) => a.getTime() - b.getTime());
    return { start: dates[0], end: dates[1] };
  }
  return {};
}

function findTotal(text: string): number | undefined {
  // "Importe total ... 87,45 €"
  const m = text.match(
    /(?:Importe|Total)\s+(?:total|factura)?[^\d€]{0,30}(-?\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?)\s*€/i,
  );
  if (m) {
    const v = toNumber(m[1]);
    if (v !== undefined && v > 0) return v;
  }
  return undefined;
}

function findSupplyAddress(text: string): string | undefined {
  // "Dirección de suministro:" / "Punto de suministro:" + línea siguiente
  const m = text.match(
    /(?:Direcci[oó]n\s+(?:de\s+)?suministro|Punto\s+de\s+suministro|Lugar\s+de\s+suministro)\s*:?\s*([^\n\r]{8,160})/i,
  );
  return m ? m[1].trim().replace(/\s{2,}/g, " ") : undefined;
}

export async function parseBillPdf(buffer: ArrayBuffer): Promise<BillData> {
  const doc = await getDocumentProxy(new Uint8Array(buffer));
  const { text: pages } = await extractText(doc, { mergePages: false });
  const text = Array.isArray(pages) ? pages.join("\n") : String(pages);

  // Algunas facturas tienen mucho ruido entre letras (caracteres en celdas
  // separadas). Compactamos espacios para que los regex funcionen.
  const compact = text.replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n");

  const cups = findCups(compact);
  const tariff = findTariff(compact);
  const contractedPowerKw = findContractedPower(compact);
  const periodConsumptionKwh = findConsumption(compact);
  const { start, end } = findPeriod(compact);
  const totalEur = findTotal(compact);
  const supplyAddress = findSupplyAddress(compact);

  let estimatedAnnualKwh: number | undefined;
  if (
    periodConsumptionKwh !== undefined &&
    start &&
    end &&
    end.getTime() > start.getTime()
  ) {
    const days = (end.getTime() - start.getTime()) / 86400000;
    if (days >= 5) {
      estimatedAnnualKwh = Math.round((periodConsumptionKwh * 365) / days);
    }
  }

  return {
    cups,
    tariff,
    contractedPowerKw,
    periodConsumptionKwh,
    periodStart: start?.toISOString().slice(0, 10),
    periodEnd: end?.toISOString().slice(0, 10),
    estimatedAnnualKwh,
    totalEur,
    supplyAddress,
    rawTextSample: compact.slice(0, 500),
  };
}
