/**
 * Modelo orientativo de costes y rentabilidad para una instalación FV.
 *
 * Las cifras son rangos típicos del sector (no de Zeus). Cuando
 * Alfredo facilite la tabla €/kWp definitiva, basta con sustituir
 * los valores de `COST_BRACKETS` y `OVERHEADS`.
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
];

export const OVERHEADS: CostOverhead[] = [
  { id: "engineering", label: "Ingeniería", low: 1500, high: 3500, minKwp: 0 },
  { id: "legal", label: "Legalización y permisos", low: 1500, high: 4000, minKwp: 0 },
  { id: "ct", label: "Centro de transformación / MT", low: 80000, high: 150000, minKwp: 100 },
];

/** Precio de la electricidad asumido cuando no se ha subido factura. */
const DEFAULT_TARIFF_EUR_PER_KWH = 0.18;

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
  tariffSource: "factura" | "estimado";
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
    overheads.push({ label: o.label, low: o.low, high: o.high });
    overheadLow += o.low;
    overheadHigh += o.high;
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

  let tariffEurPerKwh = DEFAULT_TARIFF_EUR_PER_KWH;
  let tariffSource: ProfitabilityEstimate["tariffSource"] = "estimado";
  if (
    bill?.totalEur &&
    bill?.periodConsumptionKwh &&
    bill.periodConsumptionKwh > 0
  ) {
    const t = bill.totalEur / bill.periodConsumptionKwh;
    // Saneamos: precios típicos entre 0,08 y 0,40 €/kWh
    if (t >= 0.05 && t <= 0.6) {
      tariffEurPerKwh = t;
      tariffSource = "factura";
    }
  }

  // Asumimos 80% de autoconsumo real (resto compensado a 50% de la tarifa).
  const selfConsumed = yearlyKwh * 0.8;
  const compensated = yearlyKwh * 0.2 * 0.5;
  const effectiveKwhEquivalent = selfConsumed + compensated;
  const annualSavings = effectiveKwhEquivalent * tariffEurPerKwh;

  return {
    annualSavingsLow: Math.round(annualSavings * 0.9),
    annualSavingsHigh: Math.round(annualSavings * 1.1),
    paybackYearsLow: Number((cost.totalLow / (annualSavings * 1.1)).toFixed(1)),
    paybackYearsHigh: Number((cost.totalHigh / (annualSavings * 0.9)).toFixed(1)),
    tariffEurPerKwh,
    tariffSource,
  };
}
