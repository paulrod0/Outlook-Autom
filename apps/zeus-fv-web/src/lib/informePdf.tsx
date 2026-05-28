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
 * Informe técnico — variante sobria sin marketing, sólo métricas.
 * Pensado para el ingeniero responsable / cliente técnico que quiere
 * los números crudos del estudio (PVGIS, performance ratio, layout).
 */

const C = BRAND.colors;
const s = StyleSheet.create({
  page: { backgroundColor: C.white, color: C.ink, fontSize: 10, fontFamily: "Helvetica", padding: 36 },
  hRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.cyanLight },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandCircle: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.cyan, color: C.navyDeep, textAlign: "center", fontSize: 13, fontWeight: "bold", paddingTop: 3 },
  brandText: { color: C.navy, fontSize: 11, fontWeight: "bold" },

  h1: { color: C.navy, fontSize: 18, fontWeight: "bold", marginTop: 14 },
  h2: { color: C.cyan, fontSize: 11, fontWeight: "bold", textTransform: "uppercase", marginTop: 12, letterSpacing: 1 },
  p: { color: C.ink, fontSize: 10, lineHeight: 1.4 },
  muted: { color: C.mute, fontSize: 9 },

  tr: { flexDirection: "row", paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: C.cyanLight },
  trK: { flex: 1, color: C.navy, fontWeight: "bold" },
  trV: { width: 200, textAlign: "right" },

  twoCol: { marginTop: 8, flexDirection: "row", gap: 12 },
  col: { flex: 1 },

  mapBox: { marginTop: 10, borderWidth: 1, borderColor: C.cyanLight, borderRadius: 6, padding: 4, alignItems: "center" },
  mapImg: { width: "100%", height: 220, objectFit: "contain" },
  footer: {
    position: "absolute", bottom: 18, left: 36, right: 36,
    flexDirection: "row", justifyContent: "space-between",
    color: C.mute, fontSize: 8, borderTopWidth: 0.5, borderTopColor: C.cyanLight, paddingTop: 6,
  },
});

function fmt(n: number | null | undefined, d = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={s.tr}>
      <Text style={s.trK}>{k}</Text>
      <Text style={s.trV}>{v}</Text>
    </View>
  );
}

export function InformeDocument({
  project,
  mapImage,
}: {
  project: ProjectState;
  mapImage?: string;
}) {
  const today = new Date().toLocaleDateString("es-ES");
  const kwp = project.layout?.peakPowerKwp ?? 0;
  const yearlyKwh = project.pvgis?.yearlyKwh ?? 0;
  const specific = project.pvgis?.specificYield ?? 0;
  const monthly = project.pvgis?.monthlyKwh ?? [];
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return (
    <Document title={`Informe técnico ${project.clientName || ""}`} author={BRAND.companyName}>
      <Page size="A4" style={s.page}>
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
          <Text style={s.muted}>Informe técnico · {today}</Text>
        </View>

        <Text style={s.h1}>Informe técnico — Estudio fotovoltaico</Text>
        <Text style={s.muted}>
          Documento técnico sin contenido comercial. Datos del estudio basados
          en PVGIS v5.3 (JRC) y el algoritmo de empaquetado propietario.
        </Text>

        <Text style={s.h2}>Datos del proyecto</Text>
        <Row k="Cliente" v={project.clientName || "—"} />
        <Row k="Referencia catastral" v={project.reference || "—"} />
        <Row k="Dirección" v={project.address || "—"} />
        <Row
          k="Coordenadas centroide"
          v={
            project.centroid
              ? `${project.centroid.lat.toFixed(6)}, ${project.centroid.lon.toFixed(6)}`
              : "—"
          }
        />
        <Row k="Superficie parcela" v={`${fmt(project.parcelAreaM2, 0)} m²`} />
        <Row k="Superficie útil" v={`${fmt(project.layout?.usableAreaM2, 0)} m²`} />

        <Text style={s.h2}>Diseño técnico</Text>
        <Row k="Modelo de panel" v={`${project.panel.manufacturer} ${project.panel.model}`} />
        <Row k="Potencia unitaria" v={`${project.panel.peakWp} Wp`} />
        <Row k="Nº paneles" v={fmt(project.layout?.panelCount, 0)} />
        <Row k="Potencia pico instalada" v={`${fmt(kwp, 2)} kWp`} />
        <Row k="Inclinación" v={`${project.tiltDeg}°`} />
        <Row k="Azimut" v={`${project.azimuthDeg}°`} />
        <Row k="Separación filas" v={`${fmt(project.layout?.rowSpacingM, 2)} m`} />
        <Row k="Rotación grid" v={`${fmt(project.layout?.gridRotationDeg, 1)}°`} />

        <Text style={s.h2}>Producción (PVGIS v5.3)</Text>
        <Row k="Producción anual" v={`${fmt(yearlyKwh, 0)} kWh`} />
        <Row k="Producción específica" v={`${fmt(specific, 0)} kWh/kWp·año`} />
        <Row k="Pérdidas sistema" v="14% (estándar)" />
        <Row k="Tecnología" v="cristSi (silicio cristalino)" />
        <Row k="Tipo montaje" v="building" />

        {monthly.length === 12 && (
          <>
            <Text style={s.h2}>Producción mensual</Text>
            {months.map((m, i) => (
              <Row key={m} k={m} v={`${fmt(monthly[i], 0)} kWh`} />
            ))}
          </>
        )}

        <Text style={s.h2}>Diseño sobre cubierta</Text>
        {mapImage ? (
          <View style={s.mapBox}>
            <Image src={mapImage} style={s.mapImg} />
          </View>
        ) : (
          <Text style={s.muted}>
            (Vista satélite con disposición de paneles: genera el PDF desde la vista de mapa.)
          </Text>
        )}

        <Text style={s.h2}>Performance Ratio (estimado)</Text>
        <Text style={s.p}>
          PR ≈ 0,77 — incluye pérdidas por temperatura (~9,6 %), mismatch
          eléctrico (~5,9 %), reflexión (~3,7 %), soiling (~2 %), inversor
          (~1,6 %), sombras (~1 %), cableado (~0,7 %).
        </Text>

        <View style={s.footer} fixed>
          <Text>{BRAND.companyName} · Informe técnico — sin contenido comercial</Text>
          <Text>{today}</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function generateInformeBlob(
  project: ProjectState,
  mapImage?: string,
): Promise<Blob> {
  const instance = pdf((<InformeDocument project={project} mapImage={mapImage} />) as any);
  return await instance.toBlob();
}
