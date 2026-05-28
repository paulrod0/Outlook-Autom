/**
 * Modelo orientativo de costes y rentabilidad para una instalación FV.
 *
 * Las cifras son rangos típicos del sector (no de Zeus). Cuando
 * Alfredo facilite la tabla €/kWp definitiva, basta con sustituir
 * los valores de `COST_BRACKETS` y `OVERHEADS`.
 *
 * El modelo de rentabilidad asume:
 *  - Tarifa eléctrica deducida de la factura si está disponible;
 *    si no, una ladder por tamaño (doméstico → industrial).
 *  - Ratio de autoconsumo dependiente del tamaño y, si hay factura,
 *    capado por la demanda anual del cliente.
 *  - Excedentes compensados a precio mayorista (~0,04 €/kWh) — más
 *    realista que asumir media tarifa.
 */

import type { BillSummary } from "./store";

export type CostBracket = {
  /** Cota inferior de kWp (incluida) que aplica este precio. */
  fromKwp: number;
  /** Precio por kWp instalado (€/kWp), todo incluido excepto overheads. */
  eurPerKwpLow: number;
  eurPerKwpHigh: number;
};

export type CostOverhead = {
  /** Identificador interno. */
  id: string;
  /** Etiqueta para mostrar al usuario. */
  label: string;
  /** Rango bajo (€). */
  low: number;
  /** Rango alto (€). */
  high: number;
  /** Si la línea sólo aplica a instalaciones grandes (>kwp). */
  minKwp?: number;
  /** Si la línea escala con el tamaño: € por kWp por encima del minKwp. */
  perKwpLow?: number;
  perKwpHigh?: number;
};

/**
 * Tramos €/kWp según tamaño de instalación. Cuanto más grande, menor
 * coste unitario por economía de escala.
 */
export const COST_BRACKETS: CostBracket[] = [
  { fromKwp: 0, eurPerKwpLow: 950, eurPerKwpHigh: 1300 },
  { fromKwp: 15, eurPerKwpLow: 850, eurPerKwpHigh: 1100 },
  { fromKwp: 50, eurPerKwpLow: 750, eurPerKwpHigh: 950 },
  { fromKwp: 200, eurPerKwpLow: 650, eurPerKwpHigh: 850 },
  { fromKwp: 500, eurPerKwpLow: 600, eurPerKwpHigh: 750 },
  { fromKwp: 1000, eurPerKwpLow: 550, eurPerKwpHigh: 680 },
];

export const OVERHEADS: CostOverhead[] = [
  { id: "engineering", label: "Ingeniería", low: 1500, high: 3500, minKwp: 0 },
  { id: "legal", label: "Legalización y permisos", low: 1500, high: 4000, minKwp: 0 },
  // CT/MT escala con kWp por encima de 100 kWp (cabina + transformador + protecciones).
  {
    id: "ct",
    label: "Centro de transformación / MT",
    low: 60000,
    high: 100000,
    minKwp: 100,
    perKwpLow: 70,
    perKwpHigh: 130,
  },
];

/**
 * Tarifa eléctrica estimada por tamaño de instalación cuando no hay
 * factura. Sólo es un proxy: a más kWp, instalación más industrial y
 * cliente con tarifa más baja por la economía de escala.
 */
function defaultTariffByKwp(kwp: number): number {
  if (kwp < 15) return 0.18;   // doméstico / PVPC
  if (kwp < 100) return 0.16;  // PyME pequeña
  if (kwp < 500) return 0.13;  // industrial mediano
  if (kwp < 1500) return 0.11; // gran industrial
  return 0.095;                // gran consumidor
}

/**
 * Ratio de autoconsumo: porcentaje de la generación que efectivamente
 * cubre demanda interna en lugar de verterse a red.
 *
 * Sin factura: heurística por tamaño (cuanto más grande la planta,
 * menos probable que la demanda interna absorba todo).
 *
 * Con factura: se capa por la demanda real del cliente (no se puede
 * autoconsumir más de lo que consumes). Aun con demanda muy alta,
 * tope realista de 0,65 porque el sol no genera de noche.
 */
function selfConsumptionRatio(
  kwp: number,
  annualConsumptionKwh: number | undefined,
  yearlyKwh: number,
): number {
  if (annualConsumptionKwh && annualConsumptionKwh > 0 && yearlyKwh > 0) {
    const demandRatio = annualConsumptionKwh / yearlyKwh;
    // Como el consumo se reparte 24h y la generación sólo en horas solares,
    // incluso con demanda igual a la generación sólo ~60-65% es autoconsumida.
    return Math.min(0.65, demandRatio * 0.6);
  }
  if (kwp < 15) return 0.65;   // doméstico con baterías o consumo diurno
  if (kwp < 50) return 0.6;    // PyME pequeña
  if (kwp < 200) return 0.5;   // PyME mediana
  if (kwp < 500) return 0.42;  // industrial
  if (kwp < 1500) return 0.35; // gran industrial
  return 0.3;                  // gran consumidor sobredimensionado
}

/** Precio de venta de excedentes (compensación simplificada). */
const EXCEDENT_PRICE_EUR_PER_KWH = 0.04;

export type CostEstimate = {
  installationLow: number;
  installationHigh: number;
  overheads: Array<{ label: string; low: number; high: number }>;
  totalLow: number;
  totalHigh: number;
};

export type ProfitabilityEstimate = {
  annualSavingsLow: number;
  annualSavingsHigh: number;
  paybackYearsLow: number;
  paybackYearsHigh: number;
  tariffEurPerKwh: number;
  tariffSource: "factura" | "estimado-por-tamano";
  selfConsumptionRatio: number;
  selfConsumptionSource: "factura" | "estimado-por-tamano";
};

function pickBracket(kwp: number): CostBracket {
  let chosen = COST_BRACKETS[0];
  for (const b of COST_BRACKETS) {
    if (kwp >= b.fromKwp) chosen = b;
  }
  return chosen;
}

export function estimateCost(peakPowerKwp: number): CostEstimate | null {
  if (!Number.isFinite(peakPowerKwp) || peakPowerKwp <= 0) return null;

  const bracket = pickBracket(peakPowerKwp);
  const installationLow = peakPowerKwp * bracket.eurPerKwpLow;
  const installationHigh = peakPowerKwp * bracket.eurPerKwpHigh;

  const overheads: CostEstimate["overheads"] = [];
  let overheadLow = 0;
  let overheadHigh = 0;
  for (const o of OVERHEADS) {
    if (o.minKwp !== undefined && peakPowerKwp < o.minKwp) continue;
    const extraKwp = o.minKwp !== undefined ? Math.max(0, peakPowerKwp - o.minKwp) : 0;
    const low = o.low + extraKwp * (o.perKwpLow ?? 0);
    const high = o.high + extraKwp * (o.perKwpHigh ?? 0);
    overheads.push({ label: o.label, low: Math.round(low), high: Math.round(high) });
    overheadLow += low;
    overheadHigh += high;
  }

  return {
    installationLow,
    installationHigh,
    overheads,
    totalLow: Math.round(installationLow + overheadLow),
    totalHigh: Math.round(installationHigh + overheadHigh),
  };
}

export function estimateProfitability(
  yearlyKwh: number,
  cost: CostEstimate,
  bill?: BillSummary | null,
): ProfitabilityEstimate | null {
  if (!Number.isFinite(yearlyKwh) || yearlyKwh <= 0) return null;

  // ---- Tarifa eléctrica ----
  // Inferimos kWp aproximado desde la inversión para los defaults.
  // En la práctica este valor llega indirectamente vía `cost` (mid = ~kwp * tarifa media).
  // Pero para mayor precisión usamos el ratio yearlyKwh / specificYield≈1300 como proxy.
  const kwpProxy = yearlyKwh / 1300;
  let tariffEurPerKwh = defaultTariffByKwp(kwpProxy);
  let tariffSource: ProfitabilityEstimate["tariffSource"] = "estimado-por-tamano";
  if (
    bill?.totalEur &&
    bill?.periodConsumptionKwh &&
    bill.periodConsumptionKwh > 0
  ) {
    const t = bill.totalEur / bill.periodConsumptionKwh;
    // Saneamos: precios típicos entre 0,05 y 0,40 €/kWh.
    if (t >= 0.05 && t <= 0.6) {
      tariffEurPerKwh = t;
      tariffSource = "factura";
    }
  }

  // ---- Ratio de autoconsumo ----
  const ratio = selfConsumptionRatio(
    kwpProxy,
    bill?.estimatedAnnualKwh,
    yearlyKwh,
  );
  const selfConsumptionFromFactura =
    !!bill?.estimatedAnnualKwh && bill.estimatedAnnualKwh > 0;

  // ---- Ahorro anual ----
  const selfConsumedKwh = yearlyKwh * ratio;
  const surplusKwh = yearlyKwh - selfConsumedKwh;
  const annualSavings =
    selfConsumedKwh * tariffEurPerKwh + surplusKwh * EXCEDENT_PRICE_EUR_PER_KWH;

  if (annualSavings <= 0) return null;

  return {
    annualSavingsLow: Math.round(annualSavings * 0.9),
    annualSavingsHigh: Math.round(annualSavings * 1.1),
    paybackYearsLow: Number((cost.totalLow / (annualSavings * 1.1)).toFixed(1)),
    paybackYearsHigh: Number((cost.totalHigh / (annualSavings * 0.9)).toFixed(1)),
    tariffEurPerKwh,
    tariffSource,
    selfConsumptionRatio: ratio,
    selfConsumptionSource: selfConsumptionFromFactura
      ? "factura"
      : "estimado-por-tamano",
  };
}
