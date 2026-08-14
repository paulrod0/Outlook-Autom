"use client";

import { signIn } from "next-auth/react";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function LoginForm() {
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn("credentials", {
      email,
      password,
      callbackUrl,
      redirect: false,
    });
    setBusy(false);
    if (res?.error) {
      setError("Credenciales no válidas");
      return;
    }
    if (res?.url) window.location.href = res.url;
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-zeus-dark p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-white/5 bg-zeus-panel p-6 shadow-xl"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-zeus-green/20 text-zeus-green">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden
            >
              <path d="M13 2 3 14h7l-1 8 11-14h-7l1-6z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-100">Eficiencia</h1>
            <p className="text-xs text-slate-400">Acceso interno</p>
          </div>
        </div>

        <label className="block text-xs text-slate-300">
          <span className="mb-1 block text-[11px] text-slate-400">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-white/5 bg-slate-800/80 px-2 py-1.5 text-sm text-slate-100 focus:border-zeus-green focus:outline-none"
          />
        </label>

        <label className="block text-xs text-slate-300">
          <span className="mb-1 block text-[11px] text-slate-400">Contraseña</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-white/5 bg-slate-800/80 px-2 py-1.5 text-sm text-slate-100 focus:border-zeus-green focus:outline-none"
          />
        </label>

        {error && (
          <p className="rounded-md bg-rose-500/15 px-2 py-1.5 text-[11px] text-rose-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-zeus-green/90 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-zeus-green disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Entrando…" : "Entrar"}
        </button>

        <p className="text-center text-[11px] text-slate-500">
          Acceso restringido al equipo comercial de Grupo Optimus.
        </p>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zeus-dark" />}>
      <LoginForm />
    </Suspense>
  );
}
