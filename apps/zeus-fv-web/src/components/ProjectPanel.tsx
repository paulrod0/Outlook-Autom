"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_PANELS } from "@/lib/panelLayout";
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

  useEffect(() => {
    setClientDraft(s.clientName);
  }, [s.clientName]);

  // Recalcula al cambiar parámetros, con un pequeño debounce.
  useEffect(() => {
    if (!s.parcelGeometry) return;
    const id = setTimeout(() => {
      void runLayoutAndPvgis();
    }, 300);
    return () => clearTimeout(id);
  }, [s.panel, s.tiltDeg, s.azimuthDeg, s.edgeMarginM, s.ceLimit, s.parcelGeometry]);

  return (
    <aside className="flex h-full flex-col gap-4 overflow-y-auto border-l border-white/10 bg-zeus-panel p-5">
      <header className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-zeus-green/20 text-zeus-green">
          <BoltIcon />
        </div>
        <div>
          <h1 className="text-base font-semibold">Zeus FV</h1>
          <p className="text-xs text-slate-400">Diseñador de plantas FV</p>
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
        <SelectField
          label="Modelo de panel"
          value={`${s.panel.manufacturer}|${s.panel.model}`}
          onChange={(value) => {
            const m = DEFAULT_PANELS.find(
              (p) => `${p.manufacturer}|${p.model}` === value,
            );
            if (m) setState({ panel: m });
          }}
          options={DEFAULT_PANELS.map((p) => ({
            value: `${p.manufacturer}|${p.model}`,
            label: `${p.manufacturer} ${p.model} (${p.peakWp} Wp)`,
          }))}
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

      <SavedProjectsSection canSave={!!s.parcelGeometry} />

      <button
        type="button"
        onClick={() => void downloadOffer()}
        disabled={!s.layout || !s.pvgis}
        className="rounded-md bg-zeus-green/90 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-zeus-green disabled:cursor-not-allowed disabled:opacity-40"
      >
        Descargar oferta (PDF)
      </button>

      <footer className="mt-auto rounded-md bg-slate-800/60 p-3 text-[11px] leading-relaxed text-slate-400">
        Click sobre la cubierta · Editar polígono o añadir zonas de exclusión ·
        Guarda y descarga la oferta cuando los números cuadren.
      </footer>
    </aside>
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
            Tarifa eléctrica usada: {fmt(profitability.tariffEurPerKwh, 3)}{" "}
            €/kWh ({profitability.tariffSource === "factura"
              ? "deducida de la factura"
              : "estimada"}
            ). Asume 80 % autoconsumo y 20 % compensado a media tarifa.
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

function SavedProjectsSection({ canSave }: { canSave: boolean }) {
  const [items, setItems] = useState<ProjectSnapshot[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    void listProjects().then(setItems);
  };

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  return (
    <Section title={`Mis proyectos (${items.length || "—"})`}>
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

async function downloadOffer() {
  const { generateOfferBlob } = await import("@/lib/offerPdf");
  const project = (await import("@/lib/store")).getState();

  // Captura el canvas del mapa si existe.
  const canvas = document.querySelector(
    ".maplibregl-canvas",
  ) as HTMLCanvasElement | null;
  const mapImage = canvas ? canvas.toDataURL("image/png") : undefined;

  const blob = await generateOfferBlob(project, mapImage);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `oferta-zeus-${project.reference ?? "fv"}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
