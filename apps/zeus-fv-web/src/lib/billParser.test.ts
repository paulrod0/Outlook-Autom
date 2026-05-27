import { describe, expect, it } from "vitest";
import {
  findContractedPower,
  findCups,
  findPeriod,
  findSupplyAddress,
  findTariff,
  parseBillText,
  toNumber,
} from "./billParser";

describe("toNumber", () => {
  it("parses Spanish thousand/decimal separators", () => {
    expect(toNumber("1.234,56")).toBe(1234.56);
    expect(toNumber("1 234,56")).toBe(1234.56);
    expect(toNumber("123,4")).toBe(123.4);
    expect(toNumber("0")).toBe(0);
  });
  it("returns undefined for garbage", () => {
    expect(toNumber("abc")).toBeUndefined();
    expect(toNumber(undefined)).toBeUndefined();
  });
});

describe("findCups", () => {
  it("matches a standard ES CUPS", () => {
    expect(findCups("CUPS: ES1234567890123456AB en uso")).toBe(
      "ES1234567890123456AB",
    );
  });
  it("matches CUPS with trailing two chars", () => {
    expect(findCups("Suministro ES1234567890123456ZZ0F detalle")).toBe(
      "ES1234567890123456ZZ0F",
    );
  });
  it("returns undefined when no CUPS is present", () => {
    expect(findCups("Factura sin código de punto")).toBeUndefined();
  });
});

describe("findTariff", () => {
  it("matches 2.0TD and 3.0TD", () => {
    expect(findTariff("Tarifa 2.0TD acceso")).toBe("2.0TD");
    expect(findTariff("peaje 3.0 TD")).toBe("3.0TD");
  });
  it("matches 6.1TD variants", () => {
    expect(findTariff("ATR 6.1 TD")).toBe("6.1TD");
  });
  it("returns undefined for unknown labels", () => {
    expect(findTariff("Tarifa indexada")).toBeUndefined();
  });
});

describe("findContractedPower", () => {
  it("extracts a single power figure", () => {
    expect(findContractedPower("Potencia contratada: 4,6 kW")).toEqual([4.6]);
  });
  it("extracts several periods", () => {
    const txt = `Potencia contratada P1 5,5 kW P2 4,4 kW P3 3,3 kW resto del cuerpo`;
    expect(findContractedPower(txt)).toEqual([5.5, 4.4, 3.3]);
  });
  it("ignores kWh figures right after the block", () => {
    expect(
      findContractedPower("Potencia contratada 4,6 kW consumo 250 kWh"),
    ).toEqual([4.6]);
  });
  it("returns undefined when no 'Potencia contratada' label", () => {
    expect(findContractedPower("Sólo aparece consumo 250 kWh")).toBeUndefined();
  });
});

describe("findPeriod", () => {
  it("parses 'del DD/MM/YYYY al DD/MM/YYYY'", () => {
    const r = findPeriod(
      "Periodo de facturación: del 01/03/2026 al 31/03/2026",
    );
    expect(r.start?.toISOString().slice(0, 10)).toBe("2026-03-01");
    expect(r.end?.toISOString().slice(0, 10)).toBe("2026-03-31");
  });
  it("falls back to first two ascending dates", () => {
    const r = findPeriod("Emitida 05/04/2026. Cargos hasta 04/05/2026.");
    expect(r.start?.toISOString().slice(0, 10)).toBe("2026-04-05");
    expect(r.end?.toISOString().slice(0, 10)).toBe("2026-05-04");
  });
});

describe("findSupplyAddress", () => {
  it("extracts the line after the label", () => {
    expect(
      findSupplyAddress(
        "Dirección de suministro: CALLE LUNA 12 2B, MADRID\nOtros datos",
      ),
    ).toBe("CALLE LUNA 12 2B, MADRID");
  });
});

describe("parseBillText — end-to-end", () => {
  const sampleBill = `
    IBERDROLA · Factura
    Dirección de suministro: AV CONSTITUCIÓN 25, SEVILLA
    CUPS: ES1234567890123456AB
    Tarifa de acceso: 2.0TD
    Potencia contratada: P1 4,6 kW   P2 4,6 kW
    Periodo de facturación: del 01/02/2026 al 28/02/2026
    Consumo total ............. 312 kWh
    Importe total .............. 78,45 €
  `;

  it("extracts the basic fields", () => {
    const data = parseBillText(sampleBill);
    expect(data.cups).toBe("ES1234567890123456AB");
    expect(data.tariff).toBe("2.0TD");
    expect(data.contractedPowerKw).toEqual([4.6, 4.6]);
    expect(data.periodConsumptionKwh).toBe(312);
    expect(data.periodStart).toBe("2026-02-01");
    expect(data.periodEnd).toBe("2026-02-28");
    expect(data.totalEur).toBe(78.45);
    expect(data.supplyAddress).toContain("SEVILLA");
  });

  it("annualises consumption proportionally", () => {
    const data = parseBillText(sampleBill);
    // 312 kWh en 27 días → ~4218 kWh/año
    expect(data.estimatedAnnualKwh).toBeGreaterThan(4000);
    expect(data.estimatedAnnualKwh).toBeLessThan(4500);
  });

  it("sums per-period consumption when no 'Consumo total' field is present", () => {
    const txt = `
      Tarifa 3.0TD
      Periodo de facturación: del 01/03/2026 al 31/03/2026
      Energía consumida por periodo
      P1 1.234 kWh
      P2  567 kWh
      P3  890 kWh
    `;
    const data = parseBillText(txt);
    expect(data.periodConsumptionKwh).toBe(1234 + 567 + 890);
  });
});
