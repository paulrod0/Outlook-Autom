"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from "@react-pdf/renderer";
import { BRAND, hasBrandLogo } from "./branding";
import { estimateCost, estimateProfitability } from "./economics";
import type { ProjectState } from "./store";

/**
 * Propuesta técnica de autoconsumo (PPA) — deck de 10 páginas estilo
 * Grupo Optimus. Inspirado en "GETAFE MADRID CLIMBING WALLS SL".
 */

const C = BRAND.colors;

const s = StyleSheet.create({
  page: { backgroundColor: C.white, color: C.ink, fontSize: 10, fontFamily: "Helvetica", padding: 32 },
  pageLand: { backgroundColor: C.white, color: C.ink, fontSize: 10, fontFamily: "Helvetica", padding: 32 },
  cover: { backgroundColor: C.navyDeep, color: C.white, padding: 0 },
  coverInner: { flex: 1, padding: 48, justifyContent: "space-between" },
  logoRow: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  logoCircle: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: C.cyan,
    color: C.navyDeep, fontSize: 28, fontWeight: "bold", textAlign: "center", paddingTop: 5,
  },
  logoText: { fontSize: 22, fontWeight: "bold", color: C.white },
  logoSub: { fontSize: 9, color: C.cyanLight, letterSpacing: 4 },
  coverTitle: { color: C.cyan, fontSize: 30, fontWeight: "bold" },
  coverClient: { color: C.white, fontSize: 22, fontWeight: "bold", marginTop: 14 },
  coverKwp: { color: C.cyan, fontSize: 26, fontWeight: "bold", marginTop: 18 },

  hRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.cyanLight },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandCircle: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.cyan, color: C.navyDeep, textAlign: "center", fontSize: 13, fontWeight: "bold", paddingTop: 3 },
  brandText: { color: C.navy, fontSize: 11, fontWeight: "bold" },

  h1: { color: C.cyan, fontSize: 22, fontWeight: "bold", marginTop: 16 },
  h2: { color: C.navy, fontSize: 13, fontWeight: "bold", marginTop: 12 },
  p: { color: C.ink, fontSize: 10, lineHeight: 1.4 },
  muted: { color: C.mute, fontSize: 9 },

  grid6: { marginTop: 14, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  card6: {
    width: "32%", backgroundColor: C.cyanFaded, borderRadius: 8, padding: 12, alignItems: "center", marginBottom: 6,
  },
  cardLabel: { color: C.navy, fontSize: 9, marginBottom: 4, textAlign: "center" },
  cardValue: { color: C.cyan, fontSize: 16, fontWeight: "bold", textAlign: "center" },

  thead: { flexDirection: "row", backgroundColor: C.cyan, color: C.white, paddingVertical: 6, paddingHorizontal: 8, fontSize: 9, fontWeight: "bold" },
  tr: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 8, borderTopWidth: 0.5, borderTopColor: C.cyanLight },
  trAlt: { backgroundColor: C.cyanFaded },

  pillRow: { marginTop: 10, flexDirection: "row", gap: 8 },
  pill: { flex: 1, backgroundColor: C.cyanLight, borderRadius: 8, padding: 10, alignItems: "center" },
  pillLabel: { color: C.navy, fontSize: 8, marginBottom: 2, textAlign: "center" },
  pillValue: { color: C.cyan, fontSize: 14, fontWeight: "bold" },

  twoColBox: { marginTop: 10, flexDirection: "row", gap: 10 },
  boxIn: { flex: 1, backgroundColor: C.paper, borderRadius: 8, padding: 12, borderWidth: 1, borderColor: C.cyanLight },
  boxInTitle: { backgroundColor: C.cyan, color: C.white, fontSize: 11, fontWeight: "bold", textAlign: "center", paddingVertical: 4, marginBottom: 6, borderRadius: 4 },

  priceBox: {
    marginTop: 10, padding: 12, alignItems: "center", borderRadius: 8,
    backgroundColor: C.cyanFaded, borderWidth: 1, borderColor: C.cyanLight,
  },
  priceLabel: { color: C.navy, fontSize: 11, fontWeight: "bold" },
  priceValue: { color: C.cyan, fontSize: 28, fontWeight: "bold", marginTop: 6 },
  priceUnit: { color: C.navy, fontSize: 10, marginTop: 2 },

  footer: {
    position: "absolute", bottom: 16, left: 32, right: 32,
    flexDirection: "row", justifyContent: "space-between",
    color: C.mute, fontSize: 8, borderTopWidth: 0.5, borderTopColor: C.cyanLight, paddingTop: 6,
  },
});

function fmt(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("es-ES", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function PageHeader({ subtitle }: { subtitle: string }) {
  return (
    <View style={s.hRow}>
      <View style={s.brandRow}>
        {hasBrandLogo() ? (
          <Image src={BRAND.logoUrl} style={{ width: 80, height: 24, objectFit: "contain" }} />
        ) : (
          <>
            <Text style={s.brandCircle}>G</Text>
            <Text style={s.brandText}>{BRAND.companyName}</Text>
          </>
        )}
      </View>
      <Text style={s.muted}>Propuesta técnica · {subtitle}</Text>
    </View>
  );
}

function Footer({ today, subtitle }: { today: string; subtitle: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>{subtitle}</Text>
      <Text>{today}</Text>
    </View>
  );
}

export function OfferPPADocument({
  project,
  mapImage,
}: {
  project: ProjectState;
  mapImage?: string;
}) {
  const today = new Date().toLocaleDateString("es-ES");
  const kwp = project.layout?.peakPowerKwp ?? 0;
  const yearlyKwh = project.pvgis?.yearlyKwh ?? 0;
  const annualConsumption = project.bill?.estimatedAnnualKwh ?? 0;

  // Económico
  const cost = estimateCost(kwp);
  const baseCost = cost ? Math.round((cost.totalLow + cost.totalHigh) / 2) : 0;
  const prof = cost ? estimateProfitability(yearlyKwh, cost, project.bill) : null;
  const tariff = prof?.tariffEurPerKwh ?? 0.14;
  const annualEnergyCostNoFV = Math.round(annualConsumption * tariff);
  const selfConsumption = Math.min(yearlyKwh * 0.43, annualConsumption);
  const surplus = Math.max(0, yearlyKwh - selfConsumption);
  const annualEnergyCostFV = Math.max(0, Math.round((annualConsumption - selfConsumption) * tariff));
  const annualSaving = annualEnergyCostNoFV - annualEnergyCostFV;
  const savings25 = Math.round(annualSaving * 25);
  const payback = annualSaving > 0 ? +(baseCost / annualSaving).toFixed(1) : 0;
  const tirPct = annualSaving > 0 ? Math.round(((annualSaving / baseCost) * 100 - 0.2) * 100) / 100 : 0;
  const eurPerWp = kwp > 0 ? baseCost / (kwp * 1000) : 0;
  const panelCount = project.layout?.panelCount ?? 0;
  const inverterKw = Math.ceil(kwp);
  const surplusIncome = Math.round(surplus * 0.04);

  const subtitle = `${project.clientName || "Cliente"} — ${fmt(kwp, 2)} kWp`;
  const cardSubtitle = subtitle;
  const ppaIncomeAnnual = Math.round(yearlyKwh * project.ppa.energyPriceEurKwh);

  return (
    <Document
      title={`PPA ${project.clientName || BRAND.companyName} ${today}`}
      author={BRAND.companyName}
    >
      {/* 1. Portada */}
      <Page size="A4" style={[s.page, s.cover]} orientation="landscape">
        <View style={s.coverInner}>
          <View style={[s.logoRow, { justifyContent: "flex-end" }]}>
            {hasBrandLogo() ? (
              <Image src={BRAND.logoUrl} style={{ width: 140, height: 50, objectFit: "contain" }} />
            ) : (
              <>
                <Text style={s.logoCircle}>G</Text>
                <View>
                  <Text style={s.logoSub}>GRUPO</Text>
                  <Text style={s.logoText}>OPTIMUS</Text>
                </View>
              </>
            )}
          </View>
          <View>
            <Text style={{ color: C.cyanLight, fontSize: 11, fontStyle: "italic" }}>
              “{BRAND.tagline}”
            </Text>
            <Text style={[s.coverTitle, { marginTop: 12 }]}>
              Propuesta técnica de autoconsumo
            </Text>
            <Text style={s.coverClient}>{project.clientName || "Cliente"}</Text>
            <Text style={s.coverKwp}>{fmt(kwp, 2)} kWp</Text>
          </View>
          <Text style={{ color: C.cyanLight, fontSize: 10 }}>{today}</Text>
        </View>
      </Page>

      {/* 2. Resumen objetivos */}
      <Page size="A4" style={s.page} orientation="landscape">
        <PageHeader subtitle={cardSubtitle} />
        <Text style={s.h1}>Propuesta Técnica</Text>
        <Text style={{ color: C.navy, fontSize: 16 }}>
          ¿Qué puede hacer el sol por tu negocio?
        </Text>
        <View style={{ marginTop: 24, flexDirection: "row", gap: 24 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.cyan, fontSize: 22, fontWeight: "bold" }}>
              {project.clientName || "Cliente"}
            </Text>
            <Text style={[s.coverKwp, { color: C.cyan, fontSize: 22 }]}>
              {fmt(kwp, 2)} kWp
            </Text>
            <Text style={[s.muted, { marginTop: 14 }]}>
              📍 Ubicación: {project.address ?? "—"}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <CheckLine text="Maximizar el ahorro energético" />
            <CheckLine text="Maximizar la energía autoconsumida" />
            <CheckLine text="Maximizar la TIR" />
            <CheckLine text="Minimizar la superficie a ocupar" />
            <CheckLine text="Minimizar el impacto visual" />
          </View>
        </View>
        <Footer today={today} subtitle={cardSubtitle} />
      </Page>

      {/* 3. Datos generales */}
      <Page size="A4" style={s.page} orientation="landscape">
        <PageHeader subtitle={cardSubtitle} />
        <Text style={s.h1}>Datos generales</Text>
        <View style={s.grid6}>
          <Card label="Potencia instalada" value={`${fmt(kwp, 1)} kWp`} />
          <Card label="Energía generada" value={`${fmt(yearlyKwh, 0)} kWh`} />
          <Card label="Producción específica" value={`${fmt(project.pvgis?.specificYield, 0)} kWh/kWp`} />
          <Card label="Módulos" value={`${fmt(panelCount, 0)}× ${project.panel.peakWp}Wp`} />
          <Card label="Inversores" value={`Huawei ${inverterKw}kW`} />
          <Card label="Tipo de estructura" value="Coplanar (microrrail)" />
        </View>
        <Footer today={today} subtitle={cardSubtitle} />
      </Page>

      {/* 4. Escenario actual */}
      <Page size="A4" style={s.page} orientation="landscape">
        <PageHeader subtitle={cardSubtitle} />
        <Text style={s.h1}>Escenario actual</Text>
        <View style={s.thead}>
          <Text style={{ width: 50 }}>Período</Text>
          <Text style={{ flex: 1, textAlign: "right" }}>Demanda kWh/año</Text>
          <Text style={{ flex: 1, textAlign: "right" }}>%</Text>
          <Text style={{ flex: 1, textAlign: "right" }}>Precio €/kWh</Text>
          <Text style={{ flex: 1, textAlign: "right" }}>Coste €</Text>
        </View>
        <View>
          {(project.bill?.contractedPowerKw ?? []).length > 0 ? (
            (project.bill?.contractedPowerKw ?? []).map((_, i) => {
              const periodConsumption = Math.round(annualConsumption / 6);
              const periodCost = Math.round(periodConsumption * tariff);
              return (
                <View key={i} style={[s.tr, i % 2 ? s.trAlt : {}]}>
                  <Text style={{ width: 50, fontWeight: "bold", color: C.navy }}>P{i + 1}</Text>
                  <Text style={{ flex: 1, textAlign: "right" }}>{fmt(periodConsumption, 0)}</Text>
                  <Text style={{ flex: 1, textAlign: "right" }}>~17%</Text>
                  <Text style={{ flex: 1, textAlign: "right" }}>{tariff.toFixed(4)}</Text>
                  <Text style={{ flex: 1, textAlign: "right" }}>{fmt(periodCost, 0)} €</Text>
                </View>
              );
            })
          ) : (
            <View style={s.tr}>
              <Text style={s.muted}>
                Sube la factura del cliente para desglosar el consumo por períodos
                P1-P6.
              </Text>
            </View>
          )}
        </View>
        <View style={s.pillRow}>
          <View style={s.pill}>
            <Text style={s.pillLabel}>Consumo anual actual</Text>
            <Text style={s.pillValue}>{fmt(annualConsumption, 0)} kWh</Text>
          </View>
          <View style={s.pill}>
            <Text style={s.pillLabel}>Coste anual actual</Text>
            <Text style={s.pillValue}>{fmt(annualEnergyCostNoFV, 0)} €</Text>
          </View>
          <View style={s.pill}>
            <Text style={s.pillLabel}>Coste promedio energía</Text>
            <Text style={s.pillValue}>{tariff.toFixed(4)} €/kWh</Text>
          </View>
        </View>
        <Footer today={today} subtitle={cardSubtitle} />
      </Page>

      {/* 5. Detalles del proyecto */}
      <Page size="A4" style={s.page} orientation="landscape">
        <PageHeader subtitle={cardSubtitle} />
        <Text style={s.h1}>Detalles del proyecto</Text>
        <View style={s.twoColBox}>
          <View style={s.boxIn}>
            <Text style={s.boxInTitle}>Incluído</Text>
            <Text style={s.p}>
              • Suministro e instalación llave en mano del sistema descrito{"\n"}
              • {panelCount}× módulos {project.panel.manufacturer} {project.panel.peakWp}Wp · total {fmt(kwp, 2)} kWp{"\n"}
              • Inversores Huawei trifásicos{"\n"}
              • Estructura coplanar (microrrail){"\n"}
              • Meter para lectura de consumos y monitorización remota{"\n"}
              • Conexionado a red, legalización, proyecto y trámites administrativos{"\n"}
              • Dirección de obra y coordinación de Seguridad y Salud{"\n"}
              • Certificado EKOenergy{"\n"}
              • Garantía de generación fotovoltaica (sujeta a contrato de mantenimiento){"\n"}
              • Validez de la oferta: 15 días
            </Text>
          </View>
          <View style={s.boxIn}>
            <Text style={s.boxInTitle}>No incluído</Text>
            <Text style={s.p}>
              • Impuestos y tasas asociados a la Licencia de obra{"\n"}
              • Tasas y avales de la empresa distribuidora del punto de conexión{"\n"}
              • Distancia máxima de los equipos al cuadro principal {">"} 30 m{"\n"}
              • Obra civil{"\n"}
              • Accesos a la cubierta y refuerzos estructurales{"\n"}
              • Vertido de excedentes con coste adicional según requisitos de la
              compañía distribuidora
            </Text>
            <View style={s.priceBox}>
              <Text style={s.priceLabel}>Precio final EPC (sin IVA)</Text>
              <Text style={s.priceValue}>{fmt(baseCost, 0)} €</Text>
              <Text style={s.priceUnit}>{eurPerWp.toFixed(4)} €/Wp</Text>
            </View>
          </View>
        </View>
        <Footer today={today} subtitle={cardSubtitle} />
      </Page>

      {/* 6. Resumen financiero */}
      <Page size="A4" style={s.page} orientation="landscape">
        <PageHeader subtitle={cardSubtitle} />
        <Text style={s.h1}>Inversión de la empresa — resumen financiero</Text>

        <View style={s.pillRow}>
          <Pill label="Inversión neta" value={`${fmt(baseCost, 0)} €`} />
          <Pill label="Coste anual sin FV" value={`${fmt(annualEnergyCostNoFV, 0)} €`} />
          <Pill label="Coste anual con FV" value={`${fmt(annualEnergyCostFV, 0)} €`} />
          <Pill label="Ahorro primer año" value={`${fmt(annualSaving, 0)} €`} />
          <Pill label="Ahorros 25 años" value={`${fmt(savings25, 0)} €`} />
          <Pill label="Payback" value={`${payback} años`} />
          <Pill label="TIR (25 años)" value={`${tirPct.toFixed(2)}%`} />
        </View>

        <Text style={[s.h2, { marginTop: 18 }]}>
          Excedentes generados a vender
        </Text>
        <View style={s.pillRow}>
          <Pill label="kWh/año excedentes" value={`${fmt(surplus, 0)} kWh`} />
          <Pill label="Precio venta excedente" value="0,04 €/kWh" />
          <Pill label="Ingresos por venta excedentes" value={`${fmt(surplusIncome, 0)} €`} />
        </View>
        <Footer today={today} subtitle={cardSubtitle} />
      </Page>

      {/* 7. Garantías */}
      <Page size="A4" style={s.page} orientation="landscape">
        <PageHeader subtitle={cardSubtitle} />
        <Text style={s.h1}>Garantizamos la producción</Text>

        <View style={[s.twoColBox, { marginTop: 14 }]}>
          <View style={s.boxIn}>
            <Text style={s.boxInTitle}>De producto</Text>
            <Text style={s.p}>
              Módulos: 10 años contra defectos · 25 años garantía de potencia{"\n"}
              Inversores: 5 años (ampliables a 10){"\n"}
              Estructura: 5 años (ampliables)
            </Text>
          </View>
          <View style={s.boxIn}>
            <Text style={s.boxInTitle}>De instalación</Text>
            <Text style={s.p}>2 años contra defectos de diseño e instalación.</Text>
            <Text style={[s.boxInTitle, { marginTop: 10 }]}>De producción</Text>
            <Text style={s.p}>Producción garantizada durante toda la vida del contrato.</Text>
          </View>
        </View>

        <Text style={[s.h2, { marginTop: 14 }]}>Planes de mantenimiento</Text>
        <View style={s.thead}>
          <Text style={{ flex: 2 }}>Concepto</Text>
          <Text style={{ flex: 1, textAlign: "center" }}>Estándar</Text>
          <Text style={{ flex: 1, textAlign: "center" }}>Premium</Text>
        </View>
        <View>
          {[
            ["Número de visitas/año", "1", "2"],
            ["Garantía de producción", "80%", "90%"],
            ["Gestión de alarmas", "NO", "SI"],
            ["Informes de rendimiento", "NO", "SI"],
            ["Limpieza de paneles", "opcional", "opcional"],
            ["Precio anual", `${Math.round(baseCost * 0.01)} €`, `${Math.round(baseCost * 0.02)} €`],
          ].map(([k, v1, v2], i) => (
            <View key={k as string} style={[s.tr, i % 2 ? s.trAlt : {}]}>
              <Text style={{ flex: 2 }}>{k}</Text>
              <Text style={{ flex: 1, textAlign: "center" }}>{v1}</Text>
              <Text style={{ flex: 1, textAlign: "center" }}>{v2}</Text>
            </View>
          ))}
        </View>
        <Footer today={today} subtitle={cardSubtitle} />
      </Page>

      {/* 8. Sin inversión - Tarifa */}
      <Page size="A4" style={s.page} orientation="landscape">
        <PageHeader subtitle={cardSubtitle} />
        <Text style={s.h1}>Sin inversión de la empresa — Tarifa {BRAND.companyName}</Text>

        <View style={s.pillRow}>
          <Pill label="Precio energía" value={`${project.ppa.energyPriceEurKwh.toFixed(4)} €/kWh`} />
          <Pill label="Duración del contrato" value={`${project.ppa.contractYears} años`} />
          <Pill label="Indexación" value={`${project.ppa.indexationPct}%`} />
          <Pill label="Energía comprometida" value="100% producción" />
        </View>

        <Text style={[s.h2, { marginTop: 18 }]}>Ventajas del modelo PPA</Text>
        <Text style={s.p}>
          • Sin inversión. Paga sólo por los kWh generados.{"\n"}
          • Reduce tus costes de electricidad desde el primer momento.{"\n"}
          • Contrato flexible con plazo y/o precio fijo según preferencias.{"\n"}
          • Servicio llave en mano: operación y mantenimiento incluidos.{"\n"}
          • Adquisición de la instalación al final del contrato (a coste 0 €).
        </Text>

        <Text style={s.muted}>
          Tarifas sujetas a la obtención del punto de conexión. Se incluyen O&M,
          garantía total, ICIO, tasas de licencia y avales para el punto de conexión.
          No se incluyen elementos en MT a criterio de la compañía distribuidora.
        </Text>

        <View style={[s.priceBox, { marginTop: 18 }]}>
          <Text style={s.priceLabel}>Ingreso anual estimado bajo PPA</Text>
          <Text style={s.priceValue}>{fmt(ppaIncomeAnnual, 0)} €/año</Text>
          <Text style={s.priceUnit}>
            calculado sobre {fmt(yearlyKwh, 0)} kWh/año × {project.ppa.energyPriceEurKwh.toFixed(4)} €/kWh
          </Text>
        </View>
        <Footer today={today} subtitle={cardSubtitle} />
      </Page>

      {/* 9. Comparativa EPC vs Alquiler */}
      <Page size="A4" style={s.page} orientation="landscape">
        <PageHeader subtitle={cardSubtitle} />
        <Text style={s.h1}>Todos los modelos de inversión — Comparativa</Text>
        <View style={s.thead}>
          <Text style={{ flex: 2 }}>Resumen</Text>
          <Text style={{ flex: 2, textAlign: "center" }}>Empresa invierte</Text>
          <Text style={{ flex: 2, textAlign: "center" }}>Alquiler {BRAND.companyName}</Text>
        </View>
        <View>
          {[
            ["Inversión inicial", `${fmt(baseCost, 0)} €`, "0 €"],
            ["Cuota mensual (*)", "0 €", `${project.ppa.energyPriceEurKwh.toFixed(4)} €/kWh (índice ${project.ppa.indexationPct}%)`],
            ["Propiedad de la instalación", "Sí, desde año 0", `No, propiedad tras ${project.ppa.contractYears} años`],
            ["Transferencia (a coste 0 €)", "—", `${project.ppa.contractYears} años`],
            ["Llave en mano", "Incluido", "Incluido"],
            ["Mantenimiento", `Estándar ${fmt(baseCost * 0.01, 0)} € / Premium ${fmt(baseCost * 0.02, 0)} €`, "Incluido"],
            ["Garantías equipos", "2 años instalación / 25 años paneles", "Garantía total durante el contrato"],
            ["EKOenergy", "Sí", "Sí"],
            ["Licencia de obra", "Incluido", "Incluido"],
            ["Avales y punto de conexión", "Sí", "Incluido (si no genera no paga)"],
            ["Coste desglosado", "Sí", "No"],
          ].map(([k, v1, v2], i) => (
            <View key={k as string} style={[s.tr, i % 2 ? s.trAlt : {}]}>
              <Text style={{ flex: 2, fontWeight: "bold", color: C.navy }}>{k}</Text>
              <Text style={{ flex: 2, textAlign: "center" }}>{v1}</Text>
              <Text style={{ flex: 2, textAlign: "center" }}>{v2}</Text>
            </View>
          ))}
        </View>
        <Footer today={today} subtitle={cardSubtitle} />
      </Page>

      {/* 10. Diseño + métricas + mapa */}
      <Page size="A4" style={s.page} orientation="landscape">
        <PageHeader subtitle={cardSubtitle} />
        <Text style={s.h1}>
          Diseño {project.panel.manufacturer} {project.panel.peakWp}Wp · {project.clientName || "Cliente"}
        </Text>

        <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.h2}>System Metrics</Text>
            <View style={[s.tr, s.trAlt]}>
              <Text style={{ flex: 1 }}>Module DC Nameplate</Text>
              <Text>{fmt(kwp, 2)} kW</Text>
            </View>
            <View style={s.tr}>
              <Text style={{ flex: 1 }}>Inverter AC Nameplate</Text>
              <Text>{inverterKw} kW (load ratio {(kwp / inverterKw).toFixed(2)})</Text>
            </View>
            <View style={[s.tr, s.trAlt]}>
              <Text style={{ flex: 1 }}>Annual Production</Text>
              <Text>{fmt(yearlyKwh / 1000, 1)} MWh</Text>
            </View>
            <View style={s.tr}>
              <Text style={{ flex: 1 }}>Performance Ratio</Text>
              <Text>76,9 %</Text>
            </View>
            <View style={[s.tr, s.trAlt]}>
              <Text style={{ flex: 1 }}>kWh/kWp</Text>
              <Text>{fmt(project.pvgis?.specificYield, 1)}</Text>
            </View>
            <View style={s.tr}>
              <Text style={{ flex: 1 }}>Weather Dataset</Text>
              <Text>PVGIS v5.3 (TMY)</Text>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.h2}>Project Location</Text>
            {mapImage ? (
              <Image src={mapImage} style={{ width: "100%", height: 220, objectFit: "contain", borderRadius: 6 }} />
            ) : (
              <Text style={s.muted}>(Vista satélite: genera el PDF desde la vista de mapa)</Text>
            )}
            <Text style={[s.muted, { marginTop: 6 }]}>
              {project.centroid
                ? `Coordenadas: ${project.centroid.lat.toFixed(6)}, ${project.centroid.lon.toFixed(6)}`
                : ""}
            </Text>
          </View>
        </View>

        <Text style={[s.h2, { marginTop: 12 }]}>Sources of System Loss (orientativo)</Text>
        <Text style={s.p}>
          Temperatura ≈ 9,6 % · Mismatch eléctrico ≈ 5,9 % · Reflexión ≈ 3,7 % ·
          Soiling ≈ 2,0 % · Inversores ≈ 1,6 % · Sombras ≈ 1,0 % · Cableado ≈ 0,7 % ·
          AC system ≈ 0,5 % · Irradiance ≈ 0,6 %
        </Text>
        <Footer today={today} subtitle={cardSubtitle} />
      </Page>
    </Document>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.card6}>
      <Text style={s.cardLabel}>{label}</Text>
      <Text style={s.cardValue}>{value}</Text>
    </View>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.pill}>
      <Text style={s.pillLabel}>{label}</Text>
      <Text style={s.pillValue}>{value}</Text>
    </View>
  );
}

function CheckLine({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
      <Text style={{ color: C.cyan, fontWeight: "bold" }}>✓</Text>
      <Text style={s.p}>{text}</Text>
    </View>
  );
}

export async function generatePPAOfferBlob(
  project: ProjectState,
  mapImage?: string,
): Promise<Blob> {
  const instance = pdf((<OfferPPADocument project={project} mapImage={mapImage} />) as any);
  return await instance.toBlob();
}
