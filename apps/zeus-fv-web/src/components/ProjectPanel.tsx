export function ProjectPanel() {
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
        <Field label="Cliente" placeholder="Nombre del cliente" />
        <Field label="Dirección" placeholder="Calle, nº, localidad" />
        <Field label="Referencia catastral" placeholder="14 caracteres" />
      </Section>

      <Section title="Parámetros (placeholder, M2)">
        <Field label="Modelo de panel" placeholder="LONGi LR5-72HBD-580M" />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Inclinación °" placeholder="15" />
          <Field label="Azimut °" placeholder="180" />
        </div>
      </Section>

      <Section title="Resultados">
        <Metric label="Superficie útil" value="—" unit="m²" />
        <Metric label="Nº paneles" value="—" />
        <Metric label="Potencia pico" value="—" unit="kWp" />
        <Metric label="Producción anual" value="—" unit="kWh" />
        <Metric label="Producción específica" value="—" unit="kWh/kWp·año" />
      </Section>

      <footer className="mt-auto rounded-md bg-slate-800/60 p-3 text-[11px] leading-relaxed text-slate-400">
        M0 — Scaffold inicial. Búsqueda de dirección operativa; persistencia,
        polígono de catastro, cálculo de paneles y PVGIS llegan en M1–M3.
      </footer>
    </aside>
  );
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
}: {
  label: string;
  placeholder?: string;
}) {
  return (
    <label className="block text-xs text-slate-300">
      <span className="mb-1 block text-[11px] text-slate-400">{label}</span>
      <input
        type="text"
        placeholder={placeholder}
        className="w-full rounded-md border border-white/5 bg-slate-800/80 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-zeus-green focus:outline-none"
      />
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
