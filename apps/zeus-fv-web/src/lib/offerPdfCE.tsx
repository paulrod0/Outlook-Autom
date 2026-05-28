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
import type { ProjectState } from "./store";

/**
 * Oferta Comunidad Energética — deck de 3 páginas estilo Grupo Optimus.
 * Inspirado en "CONCESIONARIO DE COCHES RV2": portada, página de
 * aceptación con foto aérea + casillas, e ingresos según opción 20/25/30.
 */

const C = BRAND.colors;

const s = StyleSheet.create({
  page: { backgroundColor: C.white, color: C.ink, fontSize: 10, fontFamily: "Helvetica", padding: 32 },
  cover: { backgroundColor: C.navyDeep, color: C.white, padding: 0 },
  coverInner: { flex: 1, padding: 48, justifyContent: "space-between" },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  logoCircle: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: C.cyan,
    color: C.navyDeep, fontSize: 28, fontWeight: "bold", textAlign: "center", paddingTop: 5,
  },
  logoText: { fontSize: 22, fontWeight: "bold", color: C.white },
  logoSub: { fontSize: 9, color: C.cyanLight, letterSpacing: 4 },
  coverTitle: { color: C.cyan, fontSize: 36, fontWeight: "bold" },
  coverSubtitle: { color: C.white, fontSize: 18, marginTop: 6 },
  contactBlock: { color: C.cyanLight, fontSize: 11, lineHeight: 1.6 },

  hRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.cyanLight },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandCircle: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: C.cyan,
    color: C.navyDeep, textAlign: "center", fontSize: 14, fontWeight: "bold", paddingTop: 3,
  },
  brandText: { color: C.navy, fontSize: 12, fontWeight: "bold" },

  h1: { color: C.cyan, fontSize: 22, fontWeight: "bold", marginTop: 18, textAlign: "center" },
  h2: { color: C.navy, fontSize: 13, fontWeight: "bold", marginTop: 14 },
  p: { color: C.ink, fontSize: 10, lineHeight: 1.4 },
  muted: { color: C.mute, fontSize: 9 },

  thanks: { color: C.navy, fontSize: 11, textAlign: "center", marginTop: 8 },

  card: {
    marginTop: 14, backgroundColor: C.cyanFaded, borderRadius: 10, padding: 16,
    borderWidth: 1, borderColor: C.cyanLight,
  },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  imageBox: { marginTop: 10, alignItems: "center" },
  mapImg: { width: "100%", height: 260, objectFit: "contain", borderRadius: 6 },

  optBox: {
    marginTop: 10, flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: C.cyanLight, borderRadius: 8, padding: 10,
  },
  optLabel: {
    color: C.navyDeep, fontSize: 10, fontWeight: "bold",
    backgroundColor: C.white, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6,
  },
  acceptBox: {
    marginTop: 22, padding: 16, borderRadius: 10, borderWidth: 1,
    borderColor: C.cyanLight, backgroundColor: C.paper,
  },
  acceptRow: { flexDirection: "row", marginTop: 6, alignItems: "center", gap: 8 },
  checkboxes: { flexDirection: "row", gap: 6, marginLeft: 6 },
  checkbox: { width: 16, height: 16, borderWidth: 1, borderColor: C.navy, borderRadius: 3 },
  checkboxFill: { width: 16, height: 16, borderWidth: 1, borderColor: C.navy, borderRadius: 3, backgroundColor: C.cyan },
  big: { color: C.cyan, fontSize: 32, fontWeight: "bold", textAlign: "center" },
  footer: {
    position: "absolute", bottom: 16, left: 32, right: 32,
    flexDirection: "row", justifyContent: "space-between",
    color: C.mute, fontSize: 8, borderTopWidth: 0.5, borderTopColor: C.cyanLight, paddingTop: 6,
  },
});

function fmt(n: number, digits = 0): string {
  return n.toLocaleString("es-ES", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function PageHeader() {
  return (
    <View style={s.hRow}>
      <View style={s.brandRow}>
        {hasBrandLogo() ? (
          <Image src={BRAND.logoUrl} style={{ width: 90, height: 26, objectFit: "contain" }} />
        ) : (
          <>
            <Text style={s.brandCircle}>G</Text>
            <Text style={s.brandText}>{BRAND.companyName}</Text>
          </>
        )}
      </View>
      <Text style={s.muted}>{BRAND.tagline}</Text>
    </View>
  );
}

function Footer({ today }: { today: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>{BRAND.companyName} · {BRAND.website}</Text>
      <Text>{today}</Text>
    </View>
  );
}

export function OfferCEDocument({
  project,
  mapImage,
}: {
  project: ProjectState;
  mapImage?: string;
}) {
  const today = new Date().toLocaleDateString("es-ES");
  const yearlyKwh = project.pvgis?.yearlyKwh ?? 0;
  const kwp = project.layout?.peakPowerKwp ?? 0;
  // Cálculo orientativo de ingresos por cesión (€/kWh por año contractual):
  // valores aproximados del documento referencia ~30-35 €/kW·año.
  const annual20 = Math.round(kwp * 33);
  const annual25 = Math.round(kwp * 42);
  const annual30 = Math.round(kwp * 52);
  const total20 = annual20 * 20;
  const total25 = annual25 * 25;
  const total30 = annual30 * 30;

  return (
    <Document
      title={`CE ${project.clientName || BRAND.companyName} ${today}`}
      author={BRAND.companyName}
    >
      {/* Portada */}
      <Page size="A4" style={[s.page, s.cover]}>
        <View style={s.coverInner}>
          <View style={s.logoRow}>
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
            <Text style={s.coverTitle}>La mejor solución a tu cubierta</Text>
            <Text style={s.coverSubtitle}>{project.clientName || "Cliente"}</Text>
            {project.address && (
              <Text style={{ color: C.cyanLight, marginTop: 6 }}>{project.address}</Text>
            )}
          </View>
          <View>
            <Text style={s.contactBlock}>{BRAND.website}</Text>
            <Text style={s.contactBlock}>{BRAND.email}</Text>
            <Text style={s.contactBlock}>{BRAND.phone}</Text>
          </View>
        </View>
      </Page>

      {/* Aceptación con foto aérea */}
      <Page size="A4" style={s.page}>
        <PageHeader />
        <Text style={s.thanks}>¡Gracias por confiar en {BRAND.companyName}!</Text>
        <Text style={s.h1}>{project.clientName || "Cliente"}</Text>
        {project.address && <Text style={[s.muted, { textAlign: "center" }]}>{project.address}</Text>}

        {mapImage ? (
          <View style={s.imageBox}>
            <Image src={mapImage} style={s.mapImg} />
          </View>
        ) : (
          <Text style={[s.muted, { textAlign: "center", marginTop: 18 }]}>
            (Vista aérea: genera el PDF desde la vista de mapa para adjuntarla)
          </Text>
        )}

        <View style={s.card}>
          <View style={s.cardRow}>
            <Text style={{ color: C.navy, fontWeight: "bold" }}>📅 Validez de la oferta</Text>
            <Text>30 días</Text>
            <Text style={{ color: C.navy, fontWeight: "bold" }}>📅 Fecha</Text>
            <Text>{today}</Text>
          </View>
          <View style={[s.cardRow, { marginTop: 6 }]}>
            <Text style={{ color: C.navy, fontWeight: "bold" }}>💼 {BRAND.companyName}</Text>
            <Text>{BRAND.email}</Text>
          </View>
        </View>

        <View style={s.acceptBox}>
          <Text style={[s.h2, { marginTop: 0 }]}>Aceptación de la propuesta</Text>
          <View style={s.acceptRow}>
            <Text>1. Años elegidos:</Text>
            <Text>20</Text>
            <View style={project.ce.optionYears === 20 ? s.checkboxFill : s.checkbox} />
            <Text>25</Text>
            <View style={project.ce.optionYears === 25 ? s.checkboxFill : s.checkbox} />
            <Text>30</Text>
            <View style={project.ce.optionYears === 30 ? s.checkboxFill : s.checkbox} />
          </View>
          <View style={s.acceptRow}>
            <Text>2. Cubierta apta:</Text>
            <Text>SI</Text>
            <View style={s.checkbox} />
            <Text>NO</Text>
            <View style={s.checkbox} />
          </View>
          <View style={s.acceptRow}>
            <Text>3. Ahorro deseado:</Text>
            <Text>SI</Text>
            <View style={s.checkbox} />
            <Text>NO</Text>
            <View style={s.checkbox} />
          </View>
          <Text style={[s.muted, { marginTop: 14 }]}>
            Firma:
          </Text>
          <Text style={{ marginTop: 14 }}>Nombre: _________________________________   Fecha: ___/___/______</Text>
        </View>
        <Footer today={today} />
      </Page>

      {/* Ingresos CE */}
      <Page size="A4" style={s.page}>
        <PageHeader />
        <Text style={s.h1}>Ingresos de la Comunidad Energética</Text>

        <View style={s.card}>
          <View style={s.cardRow}>
            <Text style={{ color: C.navy, fontWeight: "bold" }}>⚡ Producción de energía</Text>
            <Text>{fmt(yearlyKwh / 1000, 1)} MWh/año</Text>
            <Text style={{ color: C.navy, fontWeight: "bold" }}>🔌 Potencia pico</Text>
            <Text>{fmt(kwp, 0)} kWp</Text>
          </View>
        </View>

        <Text style={[s.h2, { marginTop: 18 }]}>
          Por la cesión de tu cubierta tienes 3 opciones según la duración del contrato:
        </Text>

        <Option
          years={20}
          annual={annual20}
          total={total20}
          highlight={project.ce.optionYears === 20}
        />
        <Option
          years={25}
          annual={annual25}
          total={total25}
          highlight={project.ce.optionYears === 25}
        />
        <Option
          years={30}
          annual={annual30}
          total={total30}
          highlight={project.ce.optionYears === 30}
        />

        <Text style={[s.muted, { marginTop: 12 }]}>
          ¹Valor estimado y sensible a variación según la potencia pico instalada
          y la producción real.
        </Text>

        <Text style={[s.h2, { marginTop: 20, textAlign: "center" }]}>
          Además puedes disfrutar del 1% de la producción anual de la planta.
        </Text>

        <View style={{ marginTop: 16, alignItems: "center" }}>
          <Text style={s.muted}>
            En resumen, con {BRAND.companyName} siempre saldrás ganando:
          </Text>
          <Text style={s.big}>
            {fmt(project.ce.optionYears === 20 ? annual20 : project.ce.optionYears === 25 ? annual25 : annual30, 0)} € al año
          </Text>
          <Text style={s.muted}>
            Beneficio calculado con la opción de {project.ce.optionYears} años.
          </Text>
        </View>
        <Footer today={today} />
      </Page>
    </Document>
  );
}

function Option({
  years,
  annual,
  total,
  highlight,
}: {
  years: number;
  annual: number;
  total: number;
  highlight?: boolean;
}) {
  return (
    <View style={[s.optBox, highlight ? { backgroundColor: C.cyan } : {}]}>
      <Text style={s.optLabel}>{years} años</Text>
      <Text style={{ color: highlight ? C.white : C.navy, fontWeight: "bold" }}>
        ........→  {fmt(annual, 0)} €/año
      </Text>
      <Text style={{ color: highlight ? C.white : C.navy }}>
        {fmt(total, 0)} € en {years} años
      </Text>
    </View>
  );
}

export async function generateCEOfferBlob(
  project: ProjectState,
  mapImage?: string,
): Promise<Blob> {
  const instance = pdf((<OfferCEDocument project={project} mapImage={mapImage} />) as any);
  return await instance.toBlob();
}
