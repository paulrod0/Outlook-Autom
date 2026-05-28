import Link from "next/link";
import { BRAND, PRODUCTS, type ProductKey } from "@/lib/branding";

const ROUTES: Record<ProductKey, string | null> = {
  fv: "/fv",
  ce: "/ce",
  ppa: "/ppa",
  telemedida: null,
  power: null,
  aerotermia: null,
  amianto: null,
  cae: null,
};

export default function Home() {
  const all = Object.values(PRODUCTS);
  const active = all.filter((p) => p.available);
  const coming = all.filter((p) => !p.available);

  return (
    <main className="min-h-screen bg-gradient-to-b from-optimus-navyDeep via-optimus-navy to-optimus-navyDeep text-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <header className="flex items-center justify-between border-b border-white/10 pb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-optimus-cyan text-optimus-navyDeep font-bold">
              G
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-optimus-cyanLight">
                {BRAND.companyName}
              </p>
              <h1 className="text-xl font-semibold">{BRAND.appName}</h1>
            </div>
          </div>
          <p className="hidden text-xs text-slate-400 sm:block">{BRAND.claim}</p>
        </header>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold text-white">¿Qué vas a estudiar hoy?</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            {BRAND.tagline}. Elige el producto que vas a presupuestar y la app te
            llevará al flujo de diseño correspondiente.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((p) => {
              const href = ROUTES[p.key];
              return (
                <Link
                  key={p.key}
                  href={href ?? "#"}
                  className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6 transition hover:border-optimus-cyan hover:bg-white/10"
                >
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-optimus-cyan">
                    <span className="inline-block h-2 w-2 rounded-full bg-optimus-cyan" />
                    Disponible
                  </div>
                  <h3 className="mt-3 text-xl font-semibold text-white">{p.name}</h3>
                  <p className="mt-2 text-sm text-slate-300">{p.tagline}</p>
                  <span className="mt-6 inline-block text-sm font-medium text-optimus-cyan group-hover:underline">
                    Abrir flujo →
                  </span>
                </Link>
              );
            })}
          </div>

          <h3 className="mt-14 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Próximamente
          </h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {coming.map((p) => (
              <div
                key={p.key}
                className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-slate-400"
              >
                <p className="text-sm font-medium text-slate-200">{p.name}</p>
                <p className="mt-1 text-xs text-slate-500">{p.tagline}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-16 flex flex-col items-start justify-between gap-3 border-t border-white/10 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center">
          <p>
            {BRAND.companyName} · {BRAND.website} · {BRAND.phone}
          </p>
          <p>Suite interna · Acceso restringido al equipo comercial</p>
        </footer>
      </div>
    </main>
  );
}
