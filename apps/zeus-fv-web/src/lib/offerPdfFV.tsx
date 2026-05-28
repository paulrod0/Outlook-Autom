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
import { computeMemberResults } from "./community";
import { estimateCost, estimateProfitability } from "./economics";
import type { ProjectState } from "./store";

/**
 * Oferta Fotovoltaica — deck de 9 páginas estilo Grupo Optimus.
 *
 * Reproduce el formato de la oferta "MODULARES ANDALUZAS":
 *   1) Portada
 *   2) Resumen visual + financiación + CO₂
 *   3) Balance energético + económico + foto satélite
 *   4) Presupuesto desglosado
 *   5) Gráficos balance (placeholder texto si no hay datos horarios)
 *   6) Componentes (paneles, inversor, meter, anclajes, cableado)
 *   7) Monitorización + flujo de energía
 *   8) ¿Por qué elegir Grupo Optimus? + extras
 *   9) Contraportada con datos de contacto
 */

const C = BRAND.colors;

const s = StyleSheet.create({
  page: {
    backgroundColor: C.white,
    color: C.ink,
    fontSize: 10,
    fontFamily: "Helvetica",
    padding: 32,
  },
  cover: {
    backgroundColor: C.navyDeep,
    color: C.white,
    padding: 0,
  },
  coverInner: {
    flex: 1,
    padding: 48,
    justifyContent: "space-between",
  },
  coverClaim: {
    color: C.cyanLight,
    fontSize: 10,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  coverLogoRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  coverLogoCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.cyan,
    color: C.navyDeep,
    fontSize: 28,
    fontWeight: "bold",
    textAlign: "center",
    paddingTop: 5,
  },
  coverLogoText: { fontSize: 22, fontWeight: "bold", color: C.white },
  coverLogoSub: { fontSize: 9, color: C.cyanLight, letterSpacing: 4 },
  coverTitle: {
    color: C.cyan,
    fontSize: 36,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  coverSection: { marginTop: 18 },
  coverLabel: {
    color: C.cyanLight,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  coverClient: {
    color: C.white,
    fontSize: 26,
    fontWeight: "bold",
    marginTop: 4,
  },
  coverKwp: {
    color: C.cyan,
    fontSize: 22,
    fontWeight: "bold",
    marginTop: 4,
  },

  // Header común al resto de páginas
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.cyanLight,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.cyan,
    color: C.navyDeep,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "bold",
    paddingTop: 3,
  },
  brandText: { color: C.navy, fontSize: 12, fontWeight: "bold" },
  brandLogo: { width: 90, height: 26, objectFit: "contain" },

  // Tipografía interna
  h1: { color: C.navy, fontSize: 20, fontWeight: "bold", marginTop: 14 },
  h2: { color: C.cyan, fontSize: 12, fontWeight: "bold", textTransform: "uppercase", letterSpacing: 1, marginTop: 14 },
  p: { color: C.ink, fontSize: 10, lineHeight: 1.4 },
  muted: { color: C.mute, fontSize: 9 },

  // Cards azul claro tipo Optimus
  hcards: { marginTop: 16, flexDirection: "row", gap: 8 },
  hcard: {
    flex: 1,
    backgroundColor: C.cyanLight,
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
  },
  hcardLabel: {
    color: C.navy,
    fontSize: 9,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 4,
  },
  hcardValue: { color: C.navy, fontSize: 16, fontWeight: "bold" },
  hcardUnit: { color: C.navy, fontSize: 8, marginTop: 1 },

  // Cuadros grandes (coste + financiación)
  twoBox: { marginTop: 16, flexDirection: "row", gap: 10 },
  bigBox: {
    flex: 1,
    backgroundColor: C.paper,
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.cyanLight,
  },
  bigBoxTitle: { color: C.navy, fontSize: 10, fontWeight: "bold" },
  bigBoxValue: { color: C.cyan, fontSize: 22, fontWeight: "bold", marginTop: 4 },
  bigBoxSub: { color: C.mute, fontSize: 8, marginTop: 2 },

  // Check items
  checks: { marginTop: 12, alignItems: "center" },
  checkItem: { color: C.navy, fontSize: 9, marginTop: 2 },

  // Tabla
  table: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: C.cyanLight,
    borderRadius: 6,
  },
  thead: {
    flexDirection: "row",
    backgroundColor: C.cyan,
    color: C.white,
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 9,
    fontWeight: "bold",
  },
  tr: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderTopWidth: 0.5,
    borderTopColor: C.cyanLight,
  },
  trAlt: {
    backgroundColor: C.cyanFaded,
  },

  // Foto / mapa
  imageBox: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: C.cyanLight,
    borderRadius: 6,
    padding: 4,
    alignItems: "center",
  },
  mapImg: { width: "100%", height: 240, objectFit: "contain" },

  // Footer estándar de página interior
  footer: {
    position: "absolute",
    bottom: 16,
    left: 32,
    right: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    color: C.mute,
    fontSize: 8,
    borderTopWidth: 0.5,
    borderTopColor: C.cyanLight,
    paddingTop: 6,
  },
});

function fmt(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("es-ES", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function PageHeader({ subtitle }: { subtitle?: string }) {
  return (
    <View style={s.headerBar}>
      <View style={s.brandRow}>
        {hasBrandLogo() ? (
          <Image src={BRAND.logoUrl} style={s.brandLogo} />
        ) : (
          <>
            <Text style={s.brandCircle}>G</Text>
            <Text style={s.brandText}>{BRAND.companyName}</Text>
          </>
        )}
      </View>
      {subtitle && <Text style={[s.muted, { fontSize: 9 }]}>{subtitle}</Text>}
    </View>
  );
}

function PageFooter({ today }: { today: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>
        {BRAND.companyName} · {BRAND.tagline}
      </Text>
      <Text>{today}</Text>
    </View>
  );
}

// ============== PÁGINAS ==============

function CoverPage({ project }: { project: ProjectState }) {
  return (
    <Page size="A4" style={[s.page, s.cover]}>
      <View style={s.coverInner}>
        <View style={s.coverLogoRow}>
          {hasBrandLogo() ? (
            <Image src={BRAND.logoUrl} style={{ width: 140, height: 50, objectFit: "contain" }} />
          ) : (
            <>
              <Text style={s.coverLogoCircle}>G</Text>
              <View>
                <Text style={s.coverLogoSub}>GRUPO</Text>
                <Text style={s.coverLogoText}>OPTIMUS</Text>
              </View>
            </>
          )}
        </View>

        <View>
          <Text style={s.coverClaim}>“{BRAND.tagline}”</Text>
          <Text style={[s.coverTitle, { marginTop: 30 }]}>FOTOVOLTAICA</Text>
          <View style={s.coverSection}>
            <Text style={s.coverLabel}>Propuesta para</Text>
            <Text style={s.coverClient}>{project.clientName || "Cliente"}</Text>
          </View>
          <View style={s.coverSection}>
            <Text style={s.coverLabel}>Potencia pico</Text>
            <Text style={s.coverKwp}>
              {fmt(project.layout?.peakPowerKwp, 2)} kW pico
            </Text>
          </View>
          {project.address && (
            <View style={s.coverSection}>
              <Text style={s.coverLabel}>Ubicación</Text>
              <Text style={{ color: C.white, fontSize: 12, marginTop: 4 }}>
                {project.address}
              </Text>
            </View>
          )}
        </View>

        <View />
      </View>
    </Page>
  );
}

function SummaryPage({ project, today }: { project: ProjectState; today: string }) {
  const kwp = project.layout?.peakPowerKwp ?? 0;
  const yearlyKwh = project.pvgis?.yearlyKwh ?? 0;
  const cost = estimateCost(kwp);
  const prof = cost ? estimateProfitability(yearlyKwh, cost, project.bill) : null;
  const monthlySaving = prof
    ? Math.round((prof.annualSavingsLow + prof.annualSavingsHigh) / 24)
    : 0;
  // CO2: aprox. 0.27 kg CO2 evitados por kWh solar; 1 árbol absorbe ~22 kg/año.
  const co2Kg = Math.round(yearlyKwh * 0.27);
  const trees = Math.round(co2Kg / 22);
  const months = project.ppa?.contractYears ? 72 : 72;
  const investment = cost ? Math.round((cost.totalLow + cost.totalHigh) / 2) : 0;
  const monthlyFinance = investment > 0 ? Math.round((investment * 1.15) / months) : 0;

  return (
    <Page size="A4" style={s.page}>
      <PageHeader subtitle={`Estudio preliminar · ${today}`} />
      <Text style={s.h1}>Un estudio personalizado para ti</Text>
      <Text style={s.p}>
        Nuestros ingenieros se han puesto manos a la obra para que tengas un
        diseño óptimo basado en tus consumos y tus necesidades. Así quedaría tu
        instalación:
      </Text>

      <View style={s.hcards}>
        <View style={s.hcard}>
          <Text style={s.hcardLabel}>Número de módulos</Text>
          <Text style={s.hcardValue}>{fmt(project.layout?.panelCount, 0)}</Text>
        </View>
        <View style={s.hcard}>
          <Text style={s.hcardLabel}>Ahorro anual estimado</Text>
          <Text style={s.hcardValue}>
            {prof ? `${fmt((prof.annualSavingsLow + prof.annualSavingsHigh) / 2, 0)} €` : "—"}
          </Text>
        </View>
        <View style={s.hcard}>
          <Text style={s.hcardLabel}>Producción anual</Text>
          <Text style={s.hcardValue}>{fmt(yearlyKwh, 0)}</Text>
          <Text style={s.hcardUnit}>kWh</Text>
        </View>
        <View style={s.hcard}>
          <Text style={s.hcardLabel}>Potencia instalación</Text>
          <Text style={s.hcardValue}>{fmt(kwp, 2)}</Text>
          <Text style={s.hcardUnit}>kW pico</Text>
        </View>
      </View>

      <View style={s.twoBox}>
        <View style={s.bigBox}>
          <Text style={s.bigBoxTitle}>Coste total de la instalación</Text>
          <Text style={s.bigBoxValue}>{fmt(investment, 0)} €</Text>
          <Text style={s.bigBoxSub}>*Impuestos no incluidos</Text>
          <View style={s.checks}>
            <Text style={s.checkItem}>✓ Facilidades de pago</Text>
            <Text style={s.checkItem}>✓ Inversión recuperada a corto plazo</Text>
          </View>
        </View>
        <View style={s.bigBox}>
          <Text style={s.bigBoxTitle}>Financiación cuota mensual ({months} meses)</Text>
          <Text style={s.bigBoxValue}>{fmt(monthlyFinance, 0)} €</Text>
          <Text style={s.bigBoxSub}>*Impuestos no incluidos · Sin desembolso inicial</Text>
          <Text style={[s.bigBoxTitle, { marginTop: 10 }]}>
            Ahorro mensual estimado
          </Text>
          <Text style={s.bigBoxValue}>{fmt(monthlySaving, 0)} €</Text>
        </View>
      </View>

      <View style={s.checks}>
        <Text style={s.checkItem}>✓ Asesoramiento gratuito</Text>
        <Text style={s.checkItem}>✓ Sin papeleos</Text>
        <Text style={s.checkItem}>✓ Paneles de alta calidad</Text>
        <Text style={s.checkItem}>✓ Instalación gratuita</Text>
        <Text style={s.checkItem}>✓ Garantía de 15 años</Text>
      </View>

      <View style={[s.twoBox, { marginTop: 14 }]}>
        <View style={[s.bigBox, { backgroundColor: C.cyanFaded }]}>
          <Text style={s.bigBoxTitle}>Ahorro en CO₂</Text>
          <Text style={s.bigBoxValue}>{fmt(co2Kg, 0)} kg/año</Text>
        </View>
        <View style={[s.bigBox, { backgroundColor: C.cyanFaded }]}>
          <Text style={s.bigBoxTitle}>Equivalente</Text>
          <Text style={s.bigBoxValue}>{fmt(trees, 0)} árboles</Text>
        </View>
      </View>
      <PageFooter today={today} />
    </Page>
  );
}

function BalancePage({
  project,
  mapImage,
  today,
}: {
  project: ProjectState;
  mapImage?: string;
  today: string;
}) {
  const yearlyKwh = project.pvgis?.yearlyKwh ?? 0;
  const annualConsumption = project.bill?.estimatedAnnualKwh ?? 0;
  const selfConsumption = Math.min(yearlyKwh * 0.43, annualConsumption);
  const surplus = Math.max(0, yearlyKwh - selfConsumption);
  const cost = project.layout?.peakPowerKwp
    ? estimateCost(project.layout.peakPowerKwp)
    : null;
  const prof = cost ? estimateProfitability(yearlyKwh, cost, project.bill) : null;
  const tariff = prof?.tariffEurPerKwh ?? 0.18;
  const billWithout = Math.round(annualConsumption * tariff);
  const annualSaving = prof
    ? Math.round((prof.annualSavingsLow + prof.annualSavingsHigh) / 2)
    : 0;
  const billWith = billWithout - annualSaving;

  return (
    <Page size="A4" style={s.page}>
      <PageHeader subtitle={`Cliente: ${project.clientName || "—"}`} />
      <Text style={s.h2}>Balance energético anual del sistema</Text>
      <View style={s.table}>
        <Row label="Demanda energética anual" value={`${fmt(annualConsumption, 0)} kWh`} alt />
        <Row label="Capacidad de generación fotovoltaica" value={`${fmt(yearlyKwh, 0)} kWh`} />
        <Row label="Autoconsumo fotovoltaico" value={`${fmt(selfConsumption, 0)} kWh`} alt />
        <Row label="Venta red, compartir o batería" value={`${fmt(surplus, 0)} kWh`} />
        <Row label="Ahorro energético anual" value={`${fmt(selfConsumption, 0)} kWh`} alt />
        <Row
          label="Aprovechamiento fotovoltaico"
          value={`${yearlyKwh > 0 ? fmt((selfConsumption / yearlyKwh) * 100, 1) : "—"} %`}
        />
        <Row
          label="Cobertura demanda energética"
          value={`${annualConsumption > 0 ? fmt((selfConsumption / annualConsumption) * 100, 1) : "—"} %`}
          alt
        />
      </View>

      <Text style={s.h2}>Balance económico anual del sistema</Text>
      <View style={s.table}>
        <Row label="Estimación factura anual SIN fotovoltaica" value={`${fmt(billWithout, 0)} €`} alt />
        <Row label="Estimación factura anual CON fotovoltaica" value={`${fmt(billWith, 0)} €`} />
        <Row label="Ahorro medio mensual" value={`${fmt(annualSaving / 12, 0)} €`} alt />
        <Row label="Ahorro anual estimado" value={`${fmt(annualSaving, 0)} €`} />
        <Row
          label="Porcentaje de ahorro anual"
          value={`${billWithout > 0 ? fmt((annualSaving / billWithout) * 100, 1) : "—"} %`}
          alt
        />
      </View>

      <Text style={s.h2}>Distribución orientativa de los módulos FV</Text>
      {mapImage ? (
        <View style={s.imageBox}>
          <Image src={mapImage} style={s.mapImg} />
        </View>
      ) : (
        <Text style={s.muted}>
          Vista satélite no disponible (genera la oferta desde la vista de mapa para
          adjuntarla automáticamente).
        </Text>
      )}
      <PageFooter today={today} />
    </Page>
  );
}

function BudgetPage({ project, today }: { project: ProjectState; today: string }) {
  const kwp = project.layout?.peakPowerKwp ?? 0;
  const cost = estimateCost(kwp);
  const base = cost ? Math.round((cost.totalLow + cost.totalHigh) / 2) : 0;
  const iva = Math.round(base * 0.21);
  const total = base + iva;
  const panelCount = project.layout?.panelCount ?? 0;
  const panel = project.panel;
  const inverterKw = Math.ceil(kwp);

  const items: Array<{ code: string; qty: number; unit: string; desc: string }> = [
    {
      code: "1.01",
      qty: panelCount,
      unit: "ud.",
      desc: `Módulos fotovoltaicos ${panel.manufacturer} ${panel.model} ${panel.peakWp} Wp o similares. 12 años de garantía de producto y 25 años de rendimiento asegurado.`,
    },
    {
      code: "1.02",
      qty: panelCount,
      unit: "ud.",
      desc: "Sistema de fijación estructural.",
    },
    {
      code: "2.01",
      qty: 1,
      unit: "ud.",
      desc: `Inversor fotovoltaico ${inverterKw} kW con un rendimiento del 98,4 % y 10 años de garantía.`,
    },
    {
      code: "2.03",
      qty: 1,
      unit: "ud.",
      desc: "Sistema de monitorización con acceso web y APP móvil/tablet con datos actuales e históricos.",
    },
    {
      code: "3.01",
      qty: 1,
      unit: "ud.",
      desc: "Instalación eléctrica en baja tensión: protecciones, cableado, conexionado de series en corriente continua hasta inversor y de corriente alterna hasta punto de conexión.",
    },
    {
      code: "4.01",
      qty: 1,
      unit: "ud.",
      desc: "Instalación de sistema de seguridad de protección colectiva para el montaje y posterior mantenimiento según Plan de Seguridad y Salud en obra.",
    },
    {
      code: "5.01",
      qty: 1,
      unit: "ud.",
      desc: "Ingeniería, dirección de obra y coordinación de seguridad y salud.",
    },
    {
      code: "5.02",
      qty: 1,
      unit: "ud.",
      desc: "Gestión y tramitación necesarias, según RD 244/2019 (no incluye ICIO).",
    },
  ];

  return (
    <Page size="A4" style={s.page}>
      <PageHeader subtitle={`Presupuesto: ${project.clientName || "—"}`} />
      <Text style={s.h1}>Presupuesto</Text>

      <View style={s.thead}>
        <Text style={{ width: 40 }}>Código</Text>
        <Text style={{ width: 50, textAlign: "center" }}>Cantidad</Text>
        <Text style={{ width: 70, textAlign: "center" }}>Unidades</Text>
        <Text style={{ flex: 1, paddingLeft: 8 }}>Descripción</Text>
      </View>
      <View style={s.table}>
        {items.map((it, i) => (
          <View key={it.code} style={[s.tr, i % 2 ? s.trAlt : {}]}>
            <Text style={{ width: 40, fontWeight: "bold", color: C.navy }}>{it.code}</Text>
            <Text style={{ width: 50, textAlign: "center" }}>{it.qty}</Text>
            <Text style={{ width: 70, textAlign: "center" }}>{it.unit}</Text>
            <Text style={{ flex: 1, paddingLeft: 8 }}>{it.desc}</Text>
          </View>
        ))}
      </View>

      <View style={{ marginTop: 14, alignItems: "flex-end" }}>
        <Text style={{ color: C.navy, fontSize: 10, fontWeight: "bold" }}>
          BASE DEL PRESENTE PRESUPUESTO: {fmt(base, 0)} €
        </Text>
      </View>
      <View style={[s.table, { marginTop: 8 }]}>
        <View style={s.thead}>
          <Text style={{ flex: 1 }}>Tipo</Text>
          <Text style={{ flex: 1, textAlign: "right" }}>Base</Text>
          <Text style={{ flex: 1, textAlign: "right" }}>IVA</Text>
          <Text style={{ flex: 1, textAlign: "right" }}>Total</Text>
        </View>
        <View style={[s.tr, { backgroundColor: C.cyanLight }]}>
          <Text style={{ flex: 1, fontWeight: "bold" }}>21%</Text>
          <Text style={{ flex: 1, textAlign: "right" }}>{fmt(base, 0)} €</Text>
          <Text style={{ flex: 1, textAlign: "right" }}>{fmt(iva, 0)} €</Text>
          <Text style={{ flex: 1, textAlign: "right", color: C.cyanDark, fontWeight: "bold" }}>
            {fmt(total, 0)} €
          </Text>
        </View>
      </View>
      <PageFooter today={today} />
    </Page>
  );
}

function ChartsPage({ today }: { today: string }) {
  return (
    <Page size="A4" style={s.page}>
      <PageHeader />
      <Text style={s.h1}>Componentes de instalación</Text>

      <View style={[s.imageBox, { padding: 14 }]}>
        <Text style={[s.h2, { marginTop: 0 }]}>Balance energético día promedio</Text>
        <Text style={s.muted}>
          Curva de producción FV (mediodía solar) vs consumo (mañana / noche). El
          autoconsumo se concentra en las horas centrales del día; los excedentes
          se vierten a red o batería; el consumo nocturno se cubre desde red.
        </Text>
      </View>

      <View style={[s.imageBox, { padding: 14, marginTop: 12 }]}>
        <Text style={[s.h2, { marginTop: 0 }]}>Análisis factura energética inicial</Text>
        <Text style={s.muted}>
          Estructura mensual de la factura con desglose por término de energía,
          potencia, impuestos y cargos asociados (datos extraídos del PDF de
          factura del cliente).
        </Text>
      </View>

      <Text style={[s.muted, { marginTop: 18 }]}>
        Los gráficos detallados se generan dinámicamente desde la herramienta interna
        de monitorización una vez la planta está instalada y conectada.
      </Text>
      <PageFooter today={today} />
    </Page>
  );
}

function ComponentsPage({ project, today }: { project: ProjectState; today: string }) {
  const panel = project.panel;
  const panelCount = project.layout?.panelCount ?? 0;
  const inverterKw = Math.ceil(project.layout?.peakPowerKwp ?? 0);
  return (
    <Page size="A4" style={s.page}>
      <PageHeader />
      <Text style={s.h1}>Componentes de instalación</Text>

      <Component title="Paneles solares" subtitle="Módulo fotovoltaico de alta calidad. Convierte la luz solar en corriente continua.">
        <Text style={s.p}>
          Número: {panelCount} paneles
          {"\n"}Potencia: {panel.peakWp} W / panel
          {"\n"}Modelo: {panel.manufacturer} {panel.model}
          {"\n"}Garantía: 12 años de producto · 25 años de rendimiento
        </Text>
      </Component>

      <Component title="Inversor" subtitle="Transforma la energía continua proveniente de las placas en corriente alterna para poder usarla.">
        <Text style={s.p}>
          Número: 1 inversor de {inverterKw} kW (HUAWEI trifásico){"\n"}
          Eficiencia: 98 %{"\n"}
          Garantía: 5 años de producto
        </Text>
      </Component>

      <Component title="Meter" subtitle="Medidor de corriente bidireccional. Mide consumo y producción fotovoltaica en tiempo real.">
        <Text style={s.p}>Cajas de registro, canalización y conectores adaptados a la potencia.</Text>
      </Component>

      <Component title="Anclajes / Cableado / Instalación eléctrica" subtitle="Diseño único adaptado a cada cubierta.">
        <Text style={s.p}>
          Anclajes: estudiados según material y orientación de la cubierta.{"\n"}
          Cableado: trazado acordado con el cliente, cuadro solar visible y accesible.{"\n"}
          Protecciones de corriente con marca registrada para la máxima seguridad.
        </Text>
      </Component>
      <PageFooter today={today} />
    </Page>
  );
}

function Component({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={[s.h2, { marginTop: 0 }]}>{title}</Text>
      <Text style={s.muted}>{subtitle}</Text>
      <View style={{ marginTop: 4 }}>{children}</View>
    </View>
  );
}

function MonitoringPage({ today }: { today: string }) {
  return (
    <Page size="A4" style={s.page}>
      <PageHeader />
      <Text style={s.h1}>Monitorización</Text>
      <Text style={s.p}>
        Podrás seguir el funcionamiento de la instalación fotovoltaica desde tu
        ordenador o la App en tu móvil. Desde {BRAND.companyName} tendremos
        acceso para detectar cualquier anomalía y ayudarte a entender su
        funcionamiento.
      </Text>

      <View style={s.checks}>
        <Text style={s.checkItem}>✓ Alarmas automáticas</Text>
        <Text style={s.checkItem}>✓ Visión global de la planta</Text>
        <Text style={s.checkItem}>✓ Diseño sencillo</Text>
        <Text style={s.checkItem}>✓ Configuración personal</Text>
      </View>

      <Text style={[s.h2, { marginTop: 22 }]}>Accede a tus consumos en cualquier lugar</Text>
      <View style={[s.imageBox, { padding: 14 }]}>
        <Text style={s.p}>
          App móvil + web · datos en tiempo real:{"\n"}
          • Producción FV instantánea{"\n"}
          • Autoconsumo del momento{"\n"}
          • Vertido a red{"\n"}
          • Histórico día / mes / año
        </Text>
      </View>
      <PageFooter today={today} />
    </Page>
  );
}

function WhyOptimusPage({ today }: { today: string }) {
  const steps = [
    { t: "Te asesoramos", d: "Te llamamos para explicarte la propuesta y posibles alternativas futuras." },
    { t: "Te visitamos", d: "Una vez acordada la instalación, nuestro técnico hace visita técnica para validar todos los detalles." },
    { t: "Sin papeleos", d: "Nos encargamos de todos los trámites para legalizar la instalación y los excedentes." },
    { t: "Instalamos", d: "Nuestro equipo de instaladores e ingenieros estará presente para una correcta puesta en marcha." },
    { t: "No te abandonamos", d: "Tras la instalación seguimos a tu disposición. Desde oficina llevamos un seguimiento diario." },
  ];
  return (
    <Page size="A4" style={s.page}>
      <PageHeader />
      <Text style={s.h1}>¿Por qué elegir {BRAND.companyName}?</Text>
      {steps.map((st, i) => (
        <View key={st.t} style={{ marginTop: 10, flexDirection: "row", gap: 10 }}>
          <Text style={[s.hcardValue, { color: C.cyan, width: 28 }]}>
            {String(i + 1).padStart(2, "0")}
          </Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.navy, fontSize: 11, fontWeight: "bold" }}>{st.t}</Text>
            <Text style={s.p}>{st.d}</Text>
          </View>
        </View>
      ))}

      <Text style={[s.h2, { marginTop: 20 }]}>Y además…</Text>
      <View style={[s.twoBox]}>
        <View style={[s.bigBox]}>
          <Text style={s.bigBoxTitle}>A medida</Text>
          <Text style={s.p}>Diseño basado en tus consumos reales.</Text>
        </View>
        <View style={s.bigBox}>
          <Text style={s.bigBoxTitle}>Dron propio</Text>
          <Text style={s.p}>Control aéreo de la instalación en todo momento.</Text>
        </View>
        <View style={s.bigBox}>
          <Text style={s.bigBoxTitle}>Red instaladores</Text>
          <Text style={s.p}>Instaladores certificados en todo el país.</Text>
        </View>
      </View>
      <PageFooter today={today} />
    </Page>
  );
}

function BackCover() {
  return (
    <Page size="A4" style={[s.page, s.cover]}>
      <View style={s.coverInner}>
        <View />
        <View>
          <View style={[s.coverLogoRow, { justifyContent: "center" }]}>
            {hasBrandLogo() ? (
              <Image src={BRAND.logoUrl} style={{ width: 180, height: 60, objectFit: "contain" }} />
            ) : (
              <>
                <Text style={s.coverLogoCircle}>G</Text>
                <View>
                  <Text style={s.coverLogoSub}>GRUPO</Text>
                  <Text style={s.coverLogoText}>OPTIMUS</Text>
                </View>
              </>
            )}
          </View>
        </View>
        <View style={{ alignItems: "center" }}>
          <Text style={{ color: C.cyanLight, fontSize: 11 }}>{BRAND.website}</Text>
          <Text style={{ color: C.cyanLight, fontSize: 11, marginTop: 4 }}>
            {BRAND.email}
          </Text>
          <Text style={{ color: C.cyanLight, fontSize: 11, marginTop: 4 }}>
            {BRAND.phone}
          </Text>
        </View>
      </View>
    </Page>
  );
}

function Row({ label, value, alt }: { label: string; value: string; alt?: boolean }) {
  return (
    <View style={[s.tr, alt ? s.trAlt : {}]}>
      <Text style={{ flex: 1, color: C.navy, fontWeight: "bold" }}>{label}</Text>
      <Text style={{ width: 130, textAlign: "right" }}>{value}</Text>
    </View>
  );
}

// Función para extraer texto plano del consumo por miembro CE (no usado en FV).
// Reservado por si se reutiliza esta capa en CE.
export function _unused(project: ProjectState) {
  return computeMemberResults(project.communityMembers, project.pvgis?.yearlyKwh ?? 0);
}

export function OfferFVDocument({
  project,
  mapImage,
}: {
  project: ProjectState;
  mapImage?: string;
}) {
  const today = new Date().toLocaleDateString("es-ES");
  return (
    <Document
      title={`Oferta FV ${project.clientName || BRAND.companyName} ${today}`}
      author={BRAND.companyName}
    >
      <CoverPage project={project} />
      <SummaryPage project={project} today={today} />
      <BalancePage project={project} mapImage={mapImage} today={today} />
      <BudgetPage project={project} today={today} />
      <ChartsPage today={today} />
      <ComponentsPage project={project} today={today} />
      <MonitoringPage today={today} />
      <WhyOptimusPage today={today} />
      <BackCover />
    </Document>
  );
}

export async function generateFVOfferBlob(
  project: ProjectState,
  mapImage?: string,
): Promise<Blob> {
  const instance = pdf((<OfferFVDocument project={project} mapImage={mapImage} />) as any);
  return await instance.toBlob();
}
