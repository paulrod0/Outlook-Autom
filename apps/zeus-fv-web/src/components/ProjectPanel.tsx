"use client";

import { useEffect, useState } from "react";
import { DEFAULT_PANELS } from "@/lib/panelLayout";
import { runLayoutAndPvgis } from "@/lib/pipeline";
import {
  deleteProject,
  listProjects,
  loadProject,
  saveCurrentProject,
  type ProjectSnapshot,
} from "@/lib/projects";
import { setState, useProjectState } from "@/lib/store";

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
        <Metric label="Nº paneles" value={fmt(s.layout?.panelCount, 0)} />
        <Metric label="Potencia pico" value={fmt(s.layout?.peakPowerKwp)} unit="kWp" />
        <Metric label="Producción anual" value={fmt(s.pvgis?.yearlyKwh, 0)} unit="kWh" />
        <Metric
          label="Producción específica"
          value={fmt(s.pvgis?.specificYield, 0)}
          unit="kWh/kWp·año"
        />
      </Section>

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

function SavedProjectsSection({ canSave }: { canSave: boolean }) {
  const [items, setItems] = useState<ProjectSnapshot[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) setItems(listProjects());
  }, [open]);

  const refresh = () => setItems(listProjects());

  return (
    <Section title={`Mis proyectos (${items.length || "—"})`}>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!canSave}
          onClick={() => {
            saveCurrentProject();
            setOpen(true);
            refresh();
          }}
          className="flex-1 rounded-md bg-zeus-panel/95 px-2 py-1.5 text-xs font-medium text-slate-200 ring-1 ring-white/10 hover:bg-zeus-panel disabled:cursor-not-allowed disabled:opacity-40"
        >
          Guardar
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
                onClick={() => loadProject(p.id)}
                className="flex-1 truncate text-left hover:text-zeus-green"
                title={`Guardado ${new Date(p.savedAt).toLocaleString("es-ES")}`}
              >
                {p.name}
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteProject(p.id);
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
          Aún no hay proyectos guardados. Los proyectos se almacenan en este
          navegador (localStorage); la sincronización con Supabase llegará en
          cuanto se provisione el proyecto.
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
      centroid: { lon: centroid[0], lat: centroid[1] },
      status: "computing",
    });
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
