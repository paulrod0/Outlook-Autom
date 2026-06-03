"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BRAND, PRODUCTS } from "@/lib/branding";
import { DEFAULT_PANELS } from "@/lib/panelLayout";
import {
  groupByManufacturer,
  loadPanelCatalog,
  panelKey,
  type PanelCatalogEntry,
} from "@/lib/panelCatalog";
import { estimateCost, estimateProfitability } from "@/lib/economics";
import {
  type CommunityMember,
  coefficientSum,
  computeMemberResults,
  distributeByConsumption,
  distributeEqually,
  newMember,
  normalizeCoefficients,
  totalCommunityConsumption,
} from "@/lib/community";
import { loadBuildingFor, runLayoutAndPvgis } from "@/lib/pipeline";
import {
  deleteProject,
  getBackend,
  listProjects,
  loadProject,
  saveCurrentProject,
  type ProjectSnapshot,
} from "@/lib/projects";
import { getState, setState, useProjectState } from "@/lib/store";

export function ProjectPanel() {
  const s = useProjectState();
  const [clientDraft, setClientDraft] = useState(s.clientName);
  const [refDraft, setRefDraft] = useState("");
  const [catalog, setCatalog] = useState<PanelCatalogEntry[]>(DEFAULT_PANELS);

  useEffect(() => {
    setClientDraft(s.clientName);
  }, [s.clientName]);

  useEffect(() => {
    void loadPanelCatalog().then(setCatalog);
  }, []);

  // Recalcula al cambiar parámetros, con un pequeño debounce.
  useEffect(() => {
    if (!s.parcelGeometry) return;
    const id = setTimeout(() => {
      void runLayoutAndPvgis();
    }, 300);
    return () => clearTimeout(id);
  }, [
    s.panel,
    s.tiltDeg,
    s.azimuthDeg,
    s.edgeMarginM,
    s.ceLimit,
    s.parcelGeometry,
    s.rowSpacingOverrideM,
    s.columnGapM,
    s.obstacles,
  ]);

  const productLabel = PRODUCTS[s.productType]?.name ?? "Fotovoltaica";
  return (
    <aside className="flex flex-1 flex-col gap-4 border-t border-white/10 bg-optimus-navy p-4 md:h-full md:min-h-0 md:overflow-y-auto md:border-l md:border-t-0 md:p-5">
      <header className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-optimus-cyan font-bold text-optimus-navyDeep">
          G
        </div>
        <div>
          <h1 className="text-base font-semibold">{BRAND.appName}</h1>
          <p className="text-xs text-optimus-cyanLight">{productLabel}</p>
        </div>
      </header>

      <Section title="Proyecto">
        <Field
          label="Cliente"
          value={clientDraft}
          onChange={setClientDraft}
          onBlur={() => setState({ clientName: clientDraft })}
          placeholder="Nombre del cliente"
        />
        <div className="text-xs text-slate-300">
          <p className="mb-1 text-[11px] text-slate-400">Dirección</p>
          <p className="rounded-md border border-white/5 bg-slate-800/80 px-2 py-1.5 text-sm">
            {s.address ?? <span className="text-slate-500">—</span>}
          </p>
        </div>
        <div className="text-xs text-slate-300">
          <p className="mb-1 text-[11px] text-slate-400">Referencia catastral</p>
          <div className="flex items-stretch gap-1.5">
            <input
              type="text"
              value={refDraft || s.reference || ""}
              onChange={(e) => setRefDraft(e.target.value.toUpperCase())}
              placeholder="14 caracteres"
              className="w-full rounded-md border border-white/5 bg-slate-800/80 px-2 py-1.5 text-sm uppercase tracking-wider"
            />
            <button
              type="button"
              disabled={refDraft.length < 14}
              onClick={() => void loadByRef(refDraft)}
              className="rounded-md bg-zeus-green/90 px-3 text-xs font-medium text-slate-900 hover:bg-zeus-green disabled:cursor-not-allowed disabled:opacity-40"
            >
              Cargar
            </button>
          </div>
        </div>
      </Section>

      <Section title="Parámetros">
        <GroupedPanelSelect
          catalog={catalog}
          value={panelKey(s.panel)}
          onChange={(value) => {
            const m = catalog.find((p) => panelKey(p) === value);
            if (m) setState({ panel: m });
          }}
        />
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Inclinación °"
            value={s.tiltDeg}
            min={0}
            max={60}
            step={1}
            onChange={(tiltDeg) => setState({ tiltDeg })}
          />
          <NumberField
            label="Azimut °"
            value={s.azimuthDeg}
            min={90}
            max={270}
            step={1}
            onChange={(azimuthDeg) => setState({ azimuthDeg })}
          />
        </div>
        <NumberField
          label="Margen al borde (m)"
          value={s.edgeMarginM}
          min={0}
          max={5}
          step={0.1}
          onChange={(edgeMarginM) => setState({ edgeMarginM })}
        />
        <details className="rounded-md bg-optimus-navyDeep/40 px-2 py-1.5 text-[11px] text-slate-300">
          <summary className="cursor-pointer text-slate-400">
            Avanzado: separación filas/columnas
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <NumberField
              label={`Filas (m)${s.rowSpacingOverrideM === null ? " · auto" : ""}`}
              value={
                s.rowSpacingOverrideM ?? (Number(s.layout?.rowSpacingM ?? 0) || 0)
              }
              min={0}
              max={10}
              step={0.05}
              onChange={(v) =>
                setState({ rowSpacingOverrideM: v > 0 ? v : null })
              }
            />
            <NumberField
              label="Columnas (m)"
              value={s.columnGapM}
              min={0}
              max={2}
              step={0.01}
              onChange={(columnGapM) => setState({ columnGapM })}
            />
          </div>
          {s.rowSpacingOverrideM !== null && (
            <button
              type="button"
              onClick={() => setState({ rowSpacingOverrideM: null })}
              className="mt-2 text-[10px] text-optimus-cyan hover:underline"
            >
              Restablecer separación de filas a auto (solsticio)
            </button>
          )}
        </details>
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-white/5 bg-slate-800/60 px-2 py-1.5 text-xs text-slate-200">
          <input
            type="checkbox"
            checked={s.ceLimit}
            onChange={(e) => setState({ ceLimit: e.target.checked })}
            className="accent-zeus-green"
          />
          <span>Comunidad Energética (límite 130 kWp/refcat)</span>
        </label>
      </Section>

      <Section title="Resultados">
        <Metric label="Superficie parcela" value={fmt(s.parcelAreaM2)} unit="m²" />
        <Metric label="Superficie útil" value={fmt(s.layout?.usableAreaM2)} unit="m²" />
        <Metric label="Separación filas" value={fmt(s.layout?.rowSpacingM, 2)} unit="m" />
        <Metric label="Rotación grid" value={fmt(s.layout?.gridRotationDeg, 0)} unit="°" />
        <Metric label="Nº paneles" value={fmt(s.layout?.panelCount, 0)} />
        <Metric label="Potencia pico" value={fmt(s.layout?.peakPowerKwp)} unit="kWp" />
        <Metric label="Producción anual" value={fmt(s.pvgis?.yearlyKwh, 0)} unit="kWh" />
        <Metric
          label="Producción específica"
          value={fmt(s.pvgis?.specificYield, 0)}
          unit="kWh/kWp·año"
        />
        {(s.parcelAreaM2 ?? 0) > 500 && (
          <p className="rounded-md bg-amber-500/15 px-2 py-1.5 text-[10px] leading-tight text-amber-200">
            🔥 RSCIEI (RD 164/2025) aplicado: franja perimetral libre de 1 m +
            agrupaciones de máx. 45×45 m con pasillos cortafuegos de 1,2 m
            (instalación &gt; 500 m²).
          </p>
        )}
      </Section>

      <BillSection bill={s.bill} pvgisYield={s.pvgis?.specificYield} />

      <EconomicsSection
        peakPowerKwp={s.layout?.peakPowerKwp ?? 0}
        yearlyKwh={s.pvgis?.yearlyKwh ?? 0}
        bill={s.bill}
      />

      {s.ceLimit && (
        <CommunitySection
          members={s.communityMembers}
          generationKwh={s.pvgis?.yearlyKwh ?? 0}
          bill={s.bill}
        />
      )}

      <RoofPlanesSection
        planes={s.roofPlanes}
        canPromote={
          !!s.parcelGeometry &&
          s.parcelGeometry.type === "Polygon" &&
          s.roofPlanes.length === 0
        }
      />

      {s.productType === "ppa" && <PPASection ppa={s.ppa} />}
      {s.productType === "ce" && <CESection ce={s.ce} />}

      <CommissionSection
        commercialName={s.commercialName}
        commissionEur={s.commissionEur}
      />

      <StructuralSection structural={s.structural} />

      <SolarEdgeSection />

      <SavedProjectsSection canSave={!!s.parcelGeometry} />

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => void downloadOffer(s.productType)}
          disabled={!s.layout || !s.pvgis}
          className="rounded-md bg-optimus-cyan px-3 py-2 text-sm font-medium text-optimus-navyDeep hover:bg-optimus-cyanDark hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Descargar oferta {productLabel} (PDF)
        </button>
        <button
          type="button"
          onClick={() => void downloadInforme()}
          disabled={!s.layout || !s.pvgis}
          className="rounded-md bg-white/10 px-3 py-2 text-sm font-medium text-slate-100 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Descargar informe técnico
        </button>
      </div>

      <footer className="mt-auto rounded-md bg-optimus-navyDeep/60 p-3 text-[11px] leading-relaxed text-slate-400">
        Click sobre la cubierta · Editar polígono o añadir zonas de exclusión ·
        Guarda y descarga la oferta cuando los números cuadren.
      </footer>
    </aside>
  );
}

function RoofPlanesSection({
  planes,
  canPromote,
}: {
  planes: ReturnType<typeof useProjectState>["roofPlanes"];
  canPromote: boolean;
}) {
  return (
    <Section title={`Faldones (${planes.length})`}>
      {planes.length === 0 ? (
        <p className="rounded-md bg-optimus-navyDeep/40 px-2 py-2 text-[11px] leading-tight text-slate-400">
          Modo simple: una cubierta con un tilt + azimut globales.{" "}
          {canPromote ? (
            <button
              type="button"
              onClick={() => {
                void import("@/lib/store").then((m) => m.promoteToRoofPlane());
              }}
              className="font-medium text-optimus-cyan hover:underline"
            >
              Convertir en faldón 1 →
            </button>
          ) : (
            <span>Carga primero una cubierta para empezar a partirla en faldones.</span>
          )}
        </p>
      ) : (
        <>
          {planes.map((p) => (
            <div
              key={p.id}
              className="space-y-1.5 rounded-md bg-optimus-navyDeep/40 p-2 ring-1 ring-white/5"
            >
              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  value={p.label}
                  onChange={(e) =>
                    void import("@/lib/store").then((m) =>
                      m.updateRoofPlane(p.id, { label: e.target.value }),
                    )
                  }
                  className="w-full rounded bg-slate-900/60 px-2 py-1 text-xs font-medium text-slate-100"
                />
                <label className="flex items-center gap-1 text-[10px] text-slate-400">
                  <input
                    type="checkbox"
                    checked={p.enabled}
                    onChange={(e) =>
                      void import("@/lib/store").then((m) =>
                        m.updateRoofPlane(p.id, { enabled: e.target.checked }),
                      )
                    }
                    className="accent-optimus-cyan"
                  />
                  on
                </label>
                <button
                  type="button"
                  onClick={() =>
                    void import("@/lib/store").then((m) => m.removeRoofPlane(p.id))
                  }
                  className="text-rose-400 hover:text-rose-300"
                  aria-label="Eliminar faldón"
                  title="Eliminar faldón"
                >
                  ×
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[10px] text-slate-400">
                  Inclinación °
                  <input
                    type="number"
                    value={p.tiltDeg}
                    min={0}
                    max={60}
                    step={1}
                    onChange={(e) =>
                      void import("@/lib/store").then((m) =>
                        m.updateRoofPlane(p.id, {
                          tiltDeg: parseFloat(e.target.value) || 0,
                        }),
                      )
                    }
                    className="mt-0.5 w-full rounded bg-slate-900/60 px-2 py-1 text-xs text-slate-100"
                  />
                </label>
                <label className="text-[10px] text-slate-400">
                  Azimut °
                  <input
                    type="number"
                    value={p.azimuthDeg}
                    min={0}
                    max={360}
                    step={1}
                    onChange={(e) =>
                      void import("@/lib/store").then((m) =>
                        m.updateRoofPlane(p.id, {
                          azimuthDeg: parseFloat(e.target.value) || 0,
                        }),
                      )
                    }
                    className="mt-0.5 w-full rounded bg-slate-900/60 px-2 py-1 text-xs text-slate-100"
                  />
                </label>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              void import("@/lib/store").then((m) => m.clearRoofPlanes())
            }
            className="w-full rounded-md bg-rose-500/20 px-2 py-1.5 text-[11px] text-rose-200 hover:bg-rose-500/30"
          >
            Volver a modo simple (1 cubierta)
          </button>
          <p className="text-[10px] text-slate-500 leading-tight">
            Para añadir más faldones, usa el botón <strong>+ Faldón</strong> sobre
            el mapa (próxima iteración: drawing tool). Por ahora puedes editar
            el polígono del faldón actual con &quot;Editar polígono&quot;.
          </p>
        </>
      )}
    </Section>
  );
}

function PPASection({ ppa }: { ppa: ReturnType<typeof useProjectState>["ppa"] }) {
  return (
    <Section title="Contrato PPA">
      <NumberField
        label="Precio energía (€/kWh)"
        value={ppa.energyPriceEurKwh}
        min={0.03}
        max={0.2}
        step={0.001}
        onChange={(energyPriceEurKwh) =>
          setState({ ppa: { ...ppa, energyPriceEurKwh } })
        }
      />
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Duración (años)"
          value={ppa.contractYears}
          min={5}
          max={30}
          step={1}
          onChange={(contractYears) => setState({ ppa: { ...ppa, contractYears } })}
        />
        <NumberField
          label="Indexación (%)"
          value={ppa.indexationPct}
          min={0}
          max={10}
          step={0.1}
          onChange={(indexationPct) => setState({ ppa: { ...ppa, indexationPct } })}
        />
      </div>
    </Section>
  );
}

function CESection({ ce }: { ce: ReturnType<typeof useProjectState>["ce"] }) {
  return (
    <Section title="Comunidad Energética — Contrato">
      <SelectField
        label="Opción contractual"
        value={String(ce.optionYears)}
        onChange={(v) =>
          setState({ ce: { ...ce, optionYears: Number(v) as 20 | 25 | 30 } })
        }
        options={[
          { value: "20", label: "20 años" },
          { value: "25", label: "25 años" },
          { value: "30", label: "30 años" },
        ]}
      />
    </Section>
  );
}

function CommissionSection({
  commercialName,
  commissionEur,
}: {
  commercialName: string;
  commissionEur: number;
}) {
  return (
    <Section title="Comisión / Comercial">
      <Field
        label="Comercial responsable"
        value={commercialName}
        onChange={(v) => setState({ commercialName: v })}
        placeholder="Nombre y apellidos"
      />
      <NumberField
        label="Comisión (€)"
        value={commissionEur}
        min={0}
        step={50}
        onChange={(commissionEur) => setState({ commissionEur })}
      />
    </Section>
  );
}

function StructuralSection({
  structural,
}: {
  structural: ReturnType<typeof useProjectState>["structural"];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const onPick = async (file: File) => {
    setError(null);
    if (file.size > 5 * 1024 * 1024) {
      setError("El archivo supera los 5 MB.");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
    setState({
      structural: {
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        dataUrl,
      },
    });
  };

  return (
    <Section title="Estudio estructural">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.dwg,.dxf,image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onPick(f);
          e.target.value = "";
        }}
      />
      {structural ? (
        <div className="space-y-1.5 rounded-md bg-optimus-navyDeep/60 px-2 py-2 text-xs text-slate-200">
          <p className="truncate font-medium">{structural.name}</p>
          <p className="text-[10px] text-slate-400">
            {(structural.sizeBytes / 1024).toFixed(0)} KB · {structural.mimeType}
          </p>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex-1 rounded bg-white/10 px-2 py-1 text-[11px] hover:bg-white/15"
            >
              Reemplazar
            </button>
            <button
              type="button"
              onClick={() => setState({ structural: null })}
              className="flex-1 rounded bg-rose-500/20 px-2 py-1 text-[11px] text-rose-200 hover:bg-rose-500/30"
            >
              Quitar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full rounded-md bg-optimus-navyDeep/60 px-3 py-2 text-xs font-medium text-slate-200 ring-1 ring-white/10 hover:bg-optimus-navyDeep"
        >
          Subir estudio estructural (PDF / DWG / imagen, &lt;5 MB)
        </button>
      )}
      {error && (
        <p className="rounded-md bg-rose-500/15 px-2 py-1.5 text-[11px] text-rose-300">
          {error}
        </p>
      )}
    </Section>
  );
}

function BillSection({
  bill,
  pvgisYield,
}: {
  bill: ReturnType<typeof useProjectState>["bill"];
  pvgisYield: number | undefined;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const onPick = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/bill/parse", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(j.error ?? "Error parseando factura");
      }
      const data = (await res.json()) as NonNullable<
        ReturnType<typeof useProjectState>["bill"]
      >;
      setState({
        bill: data,
        // Si la factura trae dirección y aún no hay parcela, la prerellenamos.
        address: getState().address ?? data.supplyAddress ?? null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error subiendo factura");
    } finally {
      setBusy(false);
    }
  };

  // Potencia recomendada por consumo:
  //   kWp = consumo_anual / produccion_especifica (kWh/kWp·año)
  // Usamos el yield de PVGIS si lo tenemos, si no 1500 (España media).
  const yieldKwhKwp = pvgisYield && pvgisYield > 0 ? pvgisYield : 1500;
  const recommendedKwp =
    bill?.estimatedAnnualKwh && bill.estimatedAnnualKwh > 0
      ? bill.estimatedAnnualKwh / yieldKwhKwp
      : undefined;

  return (
    <Section title="Factura del cliente">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onPick(f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="w-full rounded-md bg-zeus-panel/95 px-3 py-2 text-xs font-medium text-slate-200 ring-1 ring-white/10 hover:bg-zeus-panel disabled:opacity-40"
      >
        {busy ? "Procesando…" : bill ? "Subir otra factura" : "Subir factura (PDF)"}
      </button>
      {error && (
        <p className="rounded-md bg-rose-500/15 px-2 py-1.5 text-[11px] text-rose-300">
          {error}
        </p>
      )}
      {bill && (
        <div className="space-y-1.5">
          {bill.cups && <Metric label="CUPS" value={bill.cups} />}
          {bill.tariff && <Metric label="Tarifa" value={bill.tariff} />}
          {bill.contractedPowerKw && bill.contractedPowerKw.length > 0 && (
            <Metric
              label="Potencia contratada"
              value={bill.contractedPowerKw.map((p) => p.toString()).join(" / ")}
              unit="kW"
            />
          )}
          {bill.periodConsumptionKwh !== undefined && (
            <Metric
              label="Consumo periodo"
              value={fmt(bill.periodConsumptionKwh, 0)}
              unit="kWh"
            />
          )}
          {bill.estimatedAnnualKwh !== undefined && (
            <Metric
              label="Consumo anual est."
              value={fmt(bill.estimatedAnnualKwh, 0)}
              unit="kWh"
            />
          )}
          {recommendedKwp !== undefined && (
            <Metric
              label="kWp recomendado"
              value={fmt(recommendedKwp, 1)}
              unit="kWp"
            />
          )}
          {bill.totalEur !== undefined && (
            <Metric
              label="Importe factura"
              value={fmt(bill.totalEur, 2)}
              unit="€"
            />
          )}
        </div>
      )}
    </Section>
  );
}

function EconomicsSection({
  peakPowerKwp,
  yearlyKwh,
  bill,
}: {
  peakPowerKwp: number;
  yearlyKwh: number;
  bill: ReturnType<typeof useProjectState>["bill"];
}) {
  const cost = useMemo(() => estimateCost(peakPowerKwp), [peakPowerKwp]);
  const profitability = useMemo(
    () => (cost ? estimateProfitability(yearlyKwh, cost, bill) : null),
    [cost, yearlyKwh, bill],
  );

  if (!cost) return null;

  return (
    <Section title="Económico (orientativo)">
      <Range
        label="Inversión total"
        low={cost.totalLow}
        high={cost.totalHigh}
        unit="€"
      />
      {profitability && (
        <>
          <Range
            label="Ahorro anual"
            low={profitability.annualSavingsLow}
            high={profitability.annualSavingsHigh}
            unit="€/año"
          />
          <Range
            label="Payback"
            low={profitability.paybackYearsLow}
            high={profitability.paybackYearsHigh}
            unit="años"
            digits={1}
          />
          <p className="rounded-md bg-slate-800/50 px-2 py-1.5 text-[10px] leading-tight text-slate-400">
            Tarifa eléctrica: {fmt(profitability.tariffEurPerKwh, 3)} €/kWh{" "}
            ({profitability.tariffSource === "factura"
              ? "deducida de la factura"
              : "estimada por tamaño"}
            ) · Autoconsumo: {fmt(profitability.selfConsumptionRatio * 100, 0)} %{" "}
            ({profitability.selfConsumptionSource === "factura"
              ? "capado por demanda real"
              : "estimado por tamaño"}
            ). Excedentes se compensan a 0,04 €/kWh.
            {profitability.tariffSource !== "factura" && (
              <span className="mt-1 block text-amber-300">
                ⚠ Sube la factura del cliente para tarifa y autoconsumo realistas.
              </span>
            )}
          </p>
        </>
      )}
      <details className="rounded-md bg-slate-800/40 p-2 text-[11px] text-slate-300">
        <summary className="cursor-pointer text-slate-400">
          Desglose de costes
        </summary>
        <ul className="mt-1 space-y-0.5">
          <li className="flex justify-between">
            <span>Instalación FV</span>
            <span>
              {fmt(cost.installationLow, 0)} – {fmt(cost.installationHigh, 0)} €
            </span>
          </li>
          {cost.overheads.map((o) => (
            <li key={o.label} className="flex justify-between">
              <span>{o.label}</span>
              <span>
                {fmt(o.low, 0)} – {fmt(o.high, 0)} €
              </span>
            </li>
          ))}
        </ul>
      </details>
    </Section>
  );
}

function Range({
  label,
  low,
  high,
  unit,
  digits = 0,
}: {
  label: string;
  low: number;
  high: number;
  unit?: string;
  digits?: number;
}) {
  return (
    <div className="flex items-baseline justify-between border-b border-white/5 pb-1.5">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-sm font-medium text-slate-100">
        {fmt(low, digits)} – {fmt(high, digits)}
        {unit ? <span className="ml-1 text-xs text-slate-400">{unit}</span> : null}
      </span>
    </div>
  );
}

function CommunitySection({
  members,
  generationKwh,
  bill,
}: {
  members: CommunityMember[];
  generationKwh: number;
  bill: ReturnType<typeof useProjectState>["bill"];
}) {
  const update = (next: CommunityMember[]) =>
    setState({ communityMembers: next });

  const results = useMemo(
    () => computeMemberResults(members, generationKwh),
    [members, generationKwh],
  );
  const sum = coefficientSum(members);
  const totalConsumption = totalCommunityConsumption(members);
  const sumOk = Math.abs(sum - 1) < 0.005;

  const addMember = () => {
    // Si hay factura y aún no hay miembros, el primer miembro hereda su consumo.
    const seed =
      members.length === 0 && bill?.estimatedAnnualKwh
        ? newMember({
            name: "Consumidor 1",
            cups: bill.cups,
            annualConsumptionKwh: bill.estimatedAnnualKwh,
          })
        : newMember({ name: `Miembro ${members.length + 1}` });
    update([...members, seed]);
  };

  return (
    <Section title={`Comunidad Energética (${members.length})`}>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={addMember}
          className="flex-1 rounded-md bg-zeus-green/90 px-2 py-1.5 text-xs font-medium text-slate-900 hover:bg-zeus-green"
        >
          + Miembro
        </button>
        <button
          type="button"
          disabled={members.length === 0}
          onClick={() => update(distributeByConsumption(members))}
          className="flex-1 rounded-md bg-zeus-panel/95 px-2 py-1.5 text-xs text-slate-200 ring-1 ring-white/10 hover:bg-zeus-panel disabled:opacity-40"
        >
          Repartir por consumo
        </button>
        <button
          type="button"
          disabled={members.length === 0}
          onClick={() => update(distributeEqually(members))}
          className="flex-1 rounded-md bg-zeus-panel/95 px-2 py-1.5 text-xs text-slate-200 ring-1 ring-white/10 hover:bg-zeus-panel disabled:opacity-40"
        >
          Equitativo
        </button>
      </div>

      {members.length === 0 && (
        <p className="rounded-md bg-slate-800/40 px-2 py-2 text-[11px] text-slate-400">
          Añade los consumidores de la comunidad. El primero hereda el consumo
          de la factura si la has subido.
        </p>
      )}

      {members.map((m, i) => {
        const r = results[i];
        return (
          <div
            key={m.id}
            className="space-y-1.5 rounded-md bg-slate-800/50 p-2 ring-1 ring-white/5"
          >
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={m.name}
                onChange={(e) =>
                  update(
                    members.map((x) =>
                      x.id === m.id ? { ...x, name: e.target.value } : x,
                    ),
                  )
                }
                className="w-full rounded bg-slate-900/60 px-2 py-1 text-xs text-slate-100"
              />
              <button
                type="button"
                onClick={() => update(members.filter((x) => x.id !== m.id))}
                className="text-rose-400 hover:text-rose-300"
                aria-label="Eliminar miembro"
              >
                ×
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <label className="text-[10px] text-slate-400">
                Consumo kWh/año
                <input
                  type="number"
                  value={m.annualConsumptionKwh}
                  min={0}
                  onChange={(e) =>
                    update(
                      members.map((x) =>
                        x.id === m.id
                          ? {
                              ...x,
                              annualConsumptionKwh: Math.max(
                                0,
                                parseFloat(e.target.value) || 0,
                              ),
                            }
                          : x,
                      ),
                    )
                  }
                  className="mt-0.5 w-full rounded bg-slate-900/60 px-2 py-1 text-xs text-slate-100"
                />
              </label>
              <label className="text-[10px] text-slate-400">
                Coeficiente %
                <input
                  type="number"
                  value={Number((m.coefficient * 100).toFixed(1))}
                  min={0}
                  max={100}
                  step={0.1}
                  onChange={(e) =>
                    update(
                      members.map((x) =>
                        x.id === m.id
                          ? {
                              ...x,
                              coefficient:
                                Math.max(0, parseFloat(e.target.value) || 0) /
                                100,
                            }
                          : x,
                      ),
                    )
                  }
                  className="mt-0.5 w-full rounded bg-slate-900/60 px-2 py-1 text-xs text-slate-100"
                />
              </label>
            </div>
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>Asignado: {fmt(r.assignedKwh, 0)} kWh</span>
              <span
                className={
                  r.coveragePct >= 100 ? "text-zeus-green" : "text-amber-400"
                }
              >
                Cobertura {fmt(r.coveragePct, 0)}%
              </span>
            </div>
          </div>
        );
      })}

      {members.length > 0 && (
        <div className="space-y-1">
          <div
            className={`flex items-center justify-between rounded-md px-2 py-1.5 text-xs ${
              sumOk
                ? "bg-zeus-green/15 text-zeus-green"
                : "bg-amber-500/15 text-amber-300"
            }`}
          >
            <span>Suma coeficientes</span>
            <span>{fmt(sum * 100, 1)}%</span>
          </div>
          {!sumOk && (
            <button
              type="button"
              onClick={() => update(normalizeCoefficients(members))}
              className="w-full rounded-md bg-amber-500/80 px-2 py-1 text-[11px] font-medium text-slate-900 hover:bg-amber-500"
            >
              Normalizar a 100%
            </button>
          )}
          <Metric
            label="Consumo total comunidad"
            value={fmt(totalConsumption, 0)}
            unit="kWh"
          />
          <Metric
            label="Generación / consumo"
            value={
              totalConsumption > 0
                ? fmt((generationKwh / totalConsumption) * 100, 0)
                : "—"
            }
            unit="%"
          />
        </div>
      )}
    </Section>
  );
}

type SolarEdgeSite = {
  id: string;
  se_site_id: string;
  name: string | null;
  installed_kwp: string | number | null;
  commissioned_at: string | null;
  last_sync_at: string | null;
  project_id: string | null;
};

function SolarEdgeSection() {
  const [sites, setSites] = useState<SolarEdgeSite[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/solaredge/sites")
      .then(async (r) => {
        if (r.status === 501) return [];
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as SolarEdgeSite[];
      })
      .then((data) => setSites(Array.isArray(data) ? data : []))
      .catch((e) => setErr(e instanceof Error ? e.message : "Error"));
  }, []);

  if (sites === null) return null; // aún cargando
  if (sites.length === 0 && !err) return null; // no hay nada que mostrar

  const refreshSites = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/solaredge/sites?refresh=1");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setSites((await r.json()) as SolarEdgeSite[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title={`SolarEdge (${sites.length})`}>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex-1 rounded-md bg-optimus-navyDeep/60 px-2 py-1.5 text-xs font-medium text-slate-200 ring-1 ring-white/10 hover:bg-optimus-navyDeep"
        >
          {open ? "Ocultar plantas" : "Ver plantas reales"}
        </button>
        <button
          type="button"
          onClick={() => void refreshSites()}
          disabled={busy}
          className="rounded-md bg-optimus-navyDeep/60 px-2 py-1.5 text-xs text-slate-300 ring-1 ring-white/10 hover:bg-optimus-navyDeep disabled:opacity-40"
          title="Recargar lista de sites desde SolarEdge"
        >
          {busy ? "…" : "↻"}
        </button>
      </div>
      {err && (
        <p className="rounded-md bg-rose-500/15 px-2 py-1 text-[10px] text-rose-300">
          {err}
        </p>
      )}
      {open && (
        <div className="space-y-1.5">
          {sites.map((s) => (
            <SolarEdgeSiteRow key={s.id} site={s} />
          ))}
          <p className="text-[10px] leading-tight text-slate-500">
            Datos sincronizados cada noche por cron. Para vincular esta cubierta
            con una planta, guarda el proyecto y usa{" "}
            <code>POST /api/solaredge/sites</code> con{" "}
            <code>{`{seSiteId, projectId}`}</code>.
          </p>
        </div>
      )}
    </Section>
  );
}

function SolarEdgeSiteRow({ site }: { site: SolarEdgeSite }) {
  const [stats, setStats] = useState<{
    days: number;
    totalKwh: number;
    lastDay: string | null;
  } | null>(null);

  useEffect(() => {
    // Pedimos los últimos 30 días via un endpoint que ya tenemos: kpi
    // pero kpi necesita projectId. Aquí queremos sólo la producción
    // bruta. Por ahora calculamos a través de un fetch básico al
    // monitoring (es mejor que abrir otro endpoint custom para este MVP).
    const projectId = site.project_id;
    if (!projectId) {
      // Sin proyecto vinculado: mostramos solo metadata.
      setStats({ days: 0, totalKwh: 0, lastDay: null });
      return;
    }
    void fetch(`/api/solaredge/kpi/${projectId}`)
      .then(async (r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setStats({
          days: d.windowDays ?? 0,
          totalKwh: d.realKwhWindow ?? 0,
          lastDay: d.windowLastDay ?? null,
        });
      });
  }, [site.project_id]);

  const installed = Number(site.installed_kwp) || 0;

  return (
    <div className="space-y-1 rounded-md bg-optimus-navyDeep/40 p-2 ring-1 ring-white/5">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium text-slate-100">
          {site.name ?? `Site ${site.se_site_id}`}
        </p>
        <span className="text-[10px] text-slate-400">
          {installed > 0 ? `${installed} kWp` : "—"}
        </span>
      </div>
      <div className="flex items-center justify-between text-[10px] text-slate-400">
        <span>ID {site.se_site_id}</span>
        <span>
          {site.last_sync_at
            ? `sync ${new Date(site.last_sync_at).toLocaleDateString("es-ES")}`
            : "sin sync"}
        </span>
      </div>
      {stats && stats.totalKwh > 0 && (
        <div className="rounded bg-optimus-cyan/15 px-2 py-1 text-[11px] text-optimus-cyanLight">
          {stats.days} días · {Math.round(stats.totalKwh).toLocaleString("es-ES")} kWh
          {installed > 0 && stats.days > 0 && (
            <span className="ml-1 text-slate-300">
              ({(stats.totalKwh / stats.days / installed).toFixed(2)} kWh/kWp·día)
            </span>
          )}
        </div>
      )}
      {site.project_id === null && (
        <p className="text-[10px] text-slate-500">Sin proyecto vinculado</p>
      )}
    </div>
  );
}

function SavedProjectsSection({ canSave }: { canSave: boolean }) {
  const [items, setItems] = useState<ProjectSnapshot[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [backend, setBackend] = useState<"neon" | "local" | null>(null);

  const refresh = () => {
    void listProjects().then(setItems);
  };

  useEffect(() => {
    void getBackend().then(setBackend);
  }, []);

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  return (
    <Section title={`Mis proyectos (${items.length || "—"})`}>
      {backend && (
        <div className="flex items-center gap-1.5 text-[10px]">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              backend === "neon" ? "bg-zeus-green" : "bg-amber-400"
            }`}
          />
          <span className="text-slate-400">
            {backend === "neon"
              ? "Guardando en Neon (base de datos)"
              : "Guardando en este navegador (configura DATABASE_URL para Neon)"}
          </span>
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!canSave || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await saveCurrentProject();
              setOpen(true);
              refresh();
            } finally {
              setBusy(false);
            }
          }}
          className="flex-1 rounded-md bg-zeus-panel/95 px-2 py-1.5 text-xs font-medium text-slate-200 ring-1 ring-white/10 hover:bg-zeus-panel disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex-1 rounded-md bg-zeus-panel/95 px-2 py-1.5 text-xs font-medium text-slate-200 ring-1 ring-white/10 hover:bg-zeus-panel"
        >
          {open ? "Ocultar lista" : "Ver lista"}
        </button>
      </div>
      {open && items.length > 0 && (
        <ul className="max-h-40 space-y-1 overflow-auto rounded-md ring-1 ring-white/5">
          {items.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-2 bg-slate-800/60 px-2 py-1.5 text-xs text-slate-200"
            >
              <button
                type="button"
                onClick={() => void loadProject(p.id)}
                className="flex-1 truncate text-left hover:text-zeus-green"
                title={`Guardado ${new Date(p.savedAt).toLocaleString("es-ES")}`}
              >
                {p.name}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await deleteProject(p.id);
                  refresh();
                }}
                className="text-rose-400 hover:text-rose-300"
                aria-label="Eliminar"
                title="Eliminar"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && items.length === 0 && (
        <p className="rounded-md bg-slate-800/30 px-2 py-2 text-[11px] text-slate-400">
          Aún no hay proyectos guardados. Sin DATABASE_URL se guardan en este
          navegador (localStorage); al configurar Neon se sincronizan en la
          base de datos y quedan accesibles desde cualquier equipo.
        </p>
      )}
    </Section>
  );
}

function captureMapImage(): string | undefined {
  const canvas = document.querySelector(
    ".maplibregl-canvas",
  ) as HTMLCanvasElement | null;
  return canvas ? canvas.toDataURL("image/png") : undefined;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function downloadOffer(productType: "fv" | "ce" | "ppa") {
  const project = (await import("@/lib/store")).getState();
  const mapImage = captureMapImage();
  let blob: Blob;
  let prefix: string;
  if (productType === "ce") {
    const { generateCEOfferBlob } = await import("@/lib/offerPdfCE");
    blob = await generateCEOfferBlob(project, mapImage);
    prefix = "oferta-ce";
  } else if (productType === "ppa") {
    const { generatePPAOfferBlob } = await import("@/lib/offerPdfPPA");
    blob = await generatePPAOfferBlob(project, mapImage);
    prefix = "oferta-ppa";
  } else {
    const { generateFVOfferBlob } = await import("@/lib/offerPdfFV");
    blob = await generateFVOfferBlob(project, mapImage);
    prefix = "oferta-fv";
  }
  const slug = project.reference ?? (project.clientName.replace(/\s+/g, "_") || "optimus");
  triggerDownload(blob, `${prefix}-${slug}.pdf`);
}

async function downloadInforme() {
  const { generateInformeBlob } = await import("@/lib/informePdf");
  const project = (await import("@/lib/store")).getState();
  const mapImage = captureMapImage();
  const blob = await generateInformeBlob(project, mapImage);
  triggerDownload(blob, `informe-tecnico-${project.reference ?? "optimus"}.pdf`);
}

async function loadByRef(ref: string) {
  setState({ status: "loading-parcel", error: null });
  try {
    const res = await fetch(`/api/catastro/by-ref?ref=${encodeURIComponent(ref)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error ?? "Catastro: error");
    }
    const parcel = (await res.json()) as {
      reference: string;
      areaM2?: number;
      polygon: GeoJSON.Polygon | GeoJSON.MultiPolygon;
    };
    const { centroid } = await import("@turf/turf").then((t) => ({
      centroid: t.centroid(t.feature(parcel.polygon)).geometry.coordinates,
    }));
    setState({
      reference: parcel.reference,
      parcelAreaM2: parcel.areaM2 ?? null,
      parcelGeometry: parcel.polygon,
      buildingGeometry: null,
      centroid: { lon: centroid[0], lat: centroid[1] },
      status: "computing",
    });
    void loadBuildingFor(parcel.reference);
    await runLayoutAndPvgis();
  } catch (err) {
    setState({
      status: "error",
      error: err instanceof Error ? err.message : "Error desconocido",
    });
  }
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChange,
  onBlur,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
}) {
  return (
    <label className="block text-xs text-slate-300">
      <span className="mb-1 block text-[11px] text-slate-400">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className="w-full rounded-md border border-white/5 bg-slate-800/80 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-zeus-green focus:outline-none"
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="block text-xs text-slate-300">
      <span className="mb-1 block text-[11px] text-slate-400">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="w-full rounded-md border border-white/5 bg-slate-800/80 px-2 py-1.5 text-sm text-slate-100 focus:border-zeus-green focus:outline-none"
      />
    </label>
  );
}

function GroupedPanelSelect({
  catalog,
  value,
  onChange,
}: {
  catalog: PanelCatalogEntry[];
  value: string;
  onChange: (v: string) => void;
}) {
  const groups = useMemo(() => groupByManufacturer(catalog), [catalog]);
  return (
    <label className="block text-xs text-slate-300">
      <span className="mb-1 block text-[11px] text-slate-400">
        Modelo de panel ({catalog.length} en catálogo)
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-white/5 bg-slate-800/80 px-2 py-1.5 text-sm text-slate-100 focus:border-zeus-green focus:outline-none"
      >
        {groups.map((g) => (
          <optgroup key={g.manufacturer} label={g.manufacturer}>
            {g.panels.map((p) => (
              <option key={panelKey(p)} value={panelKey(p)}>
                {p.model} · {p.peakWp} Wp
                {p.category === "bifacial" ? " · bifacial" : ""}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block text-xs text-slate-300">
      <span className="mb-1 block text-[11px] text-slate-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-white/5 bg-slate-800/80 px-2 py-1.5 text-sm text-slate-100 focus:border-zeus-green focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Metric({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="flex items-baseline justify-between border-b border-white/5 pb-1.5">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-sm font-medium text-slate-100">
        {value}
        {unit ? <span className="ml-1 text-xs text-slate-400">{unit}</span> : null}
      </span>
    </div>
  );
}

function fmt(n: number | null | undefined, decimals = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("es-ES", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function BoltIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M13 2 3 14h7l-1 8 11-14h-7l1-6z" />
    </svg>
  );
}
