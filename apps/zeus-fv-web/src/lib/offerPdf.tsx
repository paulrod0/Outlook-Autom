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
 * Genera una oferta preliminar (1 página A4) con el estilo corporativo
 * básico de Zeus. La paleta y nombre comercial salen de `lib/branding.ts`
 * para poder personalizar cuando llegue el manual de marca oficial
 * (decisión pendiente §10.4 del documento de arquitectura).
 */

const COLORS = {
  bg: BRAND.colors.bg,
  panel: BRAND.colors.panel,
  green: BRAND.colors.accent,
  greenDim: BRAND.colors.accentDim,
  textLight: BRAND.colors.textLight,
  textDim: BRAND.colors.textDim,
  border: BRAND.colors.border,
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLORS.bg,
    padding: 32,
    color: COLORS.textLight,
    fontSize: 10,
    fontFamily: "Helvetica",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.green,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandBolt: {
    width: 22,
    height: 22,
    backgroundColor: COLORS.green,
    color: COLORS.bg,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "bold",
    paddingTop: 1,
  },
  brandLogo: { width: 32, height: 32, objectFit: "contain" },
  brandText: { color: COLORS.textLight, fontSize: 16, fontWeight: "bold" },
  brandSub: { color: COLORS.textDim, fontSize: 9 },
  title: { color: COLORS.green, fontSize: 12, fontWeight: "bold" },
  titleSub: { color: COLORS.textDim, fontSize: 9 },

  twoCols: { marginTop: 18, flexDirection: "row", gap: 12 },
  card: {
    flex: 1,
    backgroundColor: COLORS.panel,
    borderRadius: 4,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardTitle: {
    color: COLORS.green,
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
  },
  rowLast: { paddingVertical: 3 },
  rowLabel: { color: COLORS.textDim },
  rowValue: { color: COLORS.textLight },

  mapBox: {
    marginTop: 14,
    backgroundColor: COLORS.panel,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 6,
    alignItems: "center",
  },
  mapImage: { width: "100%", height: 260, objectFit: "contain" },
  mapCaption: { marginTop: 6, color: COLORS.textDim, fontSize: 8 },

  totals: {
    marginTop: 14,
    flexDirection: "row",
    gap: 12,
  },
  totalCard: {
    flex: 1,
    backgroundColor: COLORS.greenDim,
    color: COLORS.bg,
    padding: 12,
    borderRadius: 4,
    textAlign: "center",
  },
  totalLabel: {
    fontSize: 9,
    color: COLORS.bg,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  totalValue: { fontSize: 18, color: COLORS.bg, fontWeight: "bold" },
  totalUnit: { fontSize: 9, color: COLORS.bg },

  footer: {
    position: "absolute",
    bottom: 24,
    left: 32,
    right: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    color: COLORS.textDim,
    fontSize: 8,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.border,
    paddingTop: 6,
  },

  econRow: {
    marginTop: 12,
    flexDirection: "row",
    gap: 12,
  },
  econCard: {
    flex: 1,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 4,
    padding: 12,
  },
  econLabel: {
    color: COLORS.textDim,
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  econValue: { color: COLORS.green, fontSize: 14, fontWeight: "bold" },
  econUnit: { color: COLORS.textDim, fontSize: 9, marginTop: 2 },
  econDetail: {
    marginTop: 10,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 4,
    padding: 10,
  },
  econDetailTitle: {
    color: COLORS.green,
    fontSize: 9,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  disclaimer: {
    marginTop: 10,
    fontSize: 8,
    fontStyle: "italic",
    color: COLORS.textDim,
  },
});

function EconomicsBlock({ project }: { project: ProjectState }) {
  const kwp = project.layout?.peakPowerKwp ?? 0;
  const yearlyKwh = project.pvgis?.yearlyKwh ?? 0;
  if (kwp <= 0 || yearlyKwh <= 0) return null;

  const cost = estimateCost(kwp);
  if (!cost) return null;
  const prof = estimateProfitability(yearlyKwh, cost, project.bill);

  return (
    <View>
      <View style={styles.econRow}>
        <View style={styles.econCard}>
          <Text style={styles.econLabel}>Inversión total</Text>
          <Text style={styles.econValue}>
            {fmt(cost.totalLow, 0)} – {fmt(cost.totalHigh, 0)}
          </Text>
          <Text style={styles.econUnit}>€</Text>
        </View>
        {prof && (
          <>
            <View style={styles.econCard}>
              <Text style={styles.econLabel}>Ahorro anual</Text>
              <Text style={styles.econValue}>
                {fmt(prof.annualSavingsLow, 0)} – {fmt(prof.annualSavingsHigh, 0)}
              </Text>
              <Text style={styles.econUnit}>€/año</Text>
            </View>
            <View style={styles.econCard}>
              <Text style={styles.econLabel}>Payback</Text>
              <Text style={styles.econValue}>
                {prof.paybackYearsLow} – {prof.paybackYearsHigh}
              </Text>
              <Text style={styles.econUnit}>años</Text>
            </View>
          </>
        )}
      </View>

      <View style={styles.econDetail}>
        <Text style={styles.econDetailTitle}>Desglose de costes</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Instalación FV</Text>
          <Text style={styles.rowValue}>
            {fmt(cost.installationLow, 0)} – {fmt(cost.installationHigh, 0)} €
          </Text>
        </View>
        {cost.overheads.map((o) => (
          <View key={o.label} style={styles.row}>
            <Text style={styles.rowLabel}>{o.label}</Text>
            <Text style={styles.rowValue}>
              {fmt(o.low, 0)} – {fmt(o.high, 0)} €
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function fmt(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("es-ES", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function CommunityBlock({ project }: { project: ProjectState }) {
  const generation = project.pvgis?.yearlyKwh ?? 0;
  const results = computeMemberResults(project.communityMembers, generation);

  return (
    <View style={styles.econDetail}>
      <Text style={styles.econDetailTitle}>
        Comunidad Energética — reparto (límite 130 kWp/refcat)
      </Text>
      <View style={[styles.row, { borderBottomColor: COLORS.green }]}>
        <Text style={[styles.rowLabel, { flex: 2 }]}>Miembro</Text>
        <Text style={[styles.rowValue, { flex: 1, textAlign: "right" }]}>
          Coef.
        </Text>
        <Text style={[styles.rowValue, { flex: 1, textAlign: "right" }]}>
          Asignado
        </Text>
        <Text style={[styles.rowValue, { flex: 1, textAlign: "right" }]}>
          Cobertura
        </Text>
      </View>
      {results.map((r) => (
        <View key={r.member.id} style={styles.row}>
          <Text style={[styles.rowLabel, { flex: 2 }]}>{r.member.name}</Text>
          <Text style={[styles.rowValue, { flex: 1, textAlign: "right" }]}>
            {fmt(r.member.coefficient * 100, 1)}%
          </Text>
          <Text style={[styles.rowValue, { flex: 1, textAlign: "right" }]}>
            {fmt(r.assignedKwh, 0)} kWh
          </Text>
          <Text style={[styles.rowValue, { flex: 1, textAlign: "right" }]}>
            {fmt(r.coveragePct, 0)}%
          </Text>
        </View>
      ))}
    </View>
  );
}

export function OfferDocument({
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
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.brand}>
            {hasBrandLogo() ? (
              <Image src={BRAND.logoUrl} style={styles.brandLogo} />
            ) : (
              <Text style={styles.brandBolt}>Z</Text>
            )}
            <View>
              <Text style={styles.brandText}>{BRAND.companyName}</Text>
              <Text style={styles.brandSub}>{BRAND.tagline}</Text>
            </View>
          </View>
          <View>
            <Text style={styles.title}>PROYECTO FOTOVOLTAICO</Text>
            <Text style={styles.titleSub}>Estudio preliminar · {today}</Text>
          </View>
        </View>

        <View style={styles.twoCols}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>1. Datos del proyecto</Text>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Cliente</Text>
              <Text style={styles.rowValue}>
                {project.clientName || "—"}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Dirección</Text>
              <Text style={[styles.rowValue, { maxWidth: 160, textAlign: "right" }]}>
                {project.address || "—"}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Ref. catastral</Text>
              <Text style={styles.rowValue}>{project.reference || "—"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Superficie parcela</Text>
              <Text style={styles.rowValue}>
                {fmt(project.parcelAreaM2, 0)} m²
              </Text>
            </View>
            <View style={styles.rowLast}>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Superficie útil</Text>
                <Text style={styles.rowValue}>
                  {fmt(project.layout?.usableAreaM2, 0)} m²
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>2. Diseño técnico</Text>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Modelo de panel</Text>
              <Text style={styles.rowValue}>
                {project.panel.manufacturer} {project.panel.model}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Potencia unitaria</Text>
              <Text style={styles.rowValue}>{project.panel.peakWp} Wp</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Inclinación</Text>
              <Text style={styles.rowValue}>{project.tiltDeg}°</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Azimut</Text>
              <Text style={styles.rowValue}>{project.azimuthDeg}°</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Separación entre filas</Text>
              <Text style={styles.rowValue}>
                {fmt(project.layout?.rowSpacingM, 2)} m
              </Text>
            </View>
            <View style={styles.rowLast}>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Estructura</Text>
                <Text style={styles.rowValue}>Fija hincada</Text>
              </View>
            </View>
          </View>
        </View>

        {mapImage ? (
          <View style={styles.mapBox}>
            <Image src={mapImage} style={styles.mapImage} />
            <Text style={styles.mapCaption}>
              Vista satélite con polígono y disposición de paneles
            </Text>
          </View>
        ) : null}

        <View style={styles.totals}>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Nº paneles</Text>
            <Text style={styles.totalValue}>
              {fmt(project.layout?.panelCount, 0)}
            </Text>
            <Text style={styles.totalUnit}>uds</Text>
          </View>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Potencia pico</Text>
            <Text style={styles.totalValue}>
              {fmt(project.layout?.peakPowerKwp, 1)}
            </Text>
            <Text style={styles.totalUnit}>kWp</Text>
          </View>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Producción anual</Text>
            <Text style={styles.totalValue}>
              {fmt(project.pvgis?.yearlyKwh, 0)}
            </Text>
            <Text style={styles.totalUnit}>kWh</Text>
          </View>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Específica</Text>
            <Text style={styles.totalValue}>
              {fmt(project.pvgis?.specificYield, 0)}
            </Text>
            <Text style={styles.totalUnit}>kWh/kWp·año</Text>
          </View>
        </View>

        <EconomicsBlock project={project} />
        {project.ceLimit && project.communityMembers.length > 0 && (
          <CommunityBlock project={project} />
        )}
        <Text style={styles.disclaimer}>
          Estimaciones orientativas. La oferta vinculante requiere visita
          técnica y validación con la tabla de costes interna.
        </Text>

        <View style={styles.footer} fixed>
          <Text>
            {BRAND.companyName} · Estudio preliminar generado automáticamente.
            Sujeto a visita técnica.
          </Text>
          <Text>{today}</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function generateOfferBlob(
  project: ProjectState,
  mapImage?: string,
): Promise<Blob> {
  const instance = pdf(
    (<OfferDocument project={project} mapImage={mapImage} />) as any,
  );
  return await instance.toBlob();
}
