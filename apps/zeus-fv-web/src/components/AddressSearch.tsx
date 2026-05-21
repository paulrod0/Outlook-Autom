"use client";

import { useEffect, useRef, useState } from "react";
import { geocodeAddress, type GeocodeResult } from "@/lib/geocoding";

type Props = {
  disabled?: boolean;
  onPick: (result: GeocodeResult) => void;
};

export function AddressSearch({ disabled, onPick }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await geocodeAddress(query);
        setResults(r);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  return (
    <div className="rounded-lg bg-zeus-panel/95 p-2 shadow-xl ring-1 ring-white/10 backdrop-blur">
      <div className="flex items-center gap-2 rounded-md bg-slate-800/80 px-3 py-2">
        <SearchIcon />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={disabled}
          placeholder="Buscar dirección o referencia catastral…"
          className="w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        {loading && (
          <span className="text-xs text-slate-400">buscando…</span>
        )}
      </div>
      {open && results.length > 0 && (
        <ul className="mt-2 max-h-72 overflow-auto rounded-md ring-1 ring-white/5">
          {results.map((r) => (
            <li key={`${r.lat}-${r.lon}-${r.label}`}>
              <button
                type="button"
                onClick={() => {
                  onPick(r);
                  setOpen(false);
                  setQuery(r.label);
                }}
                className="block w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-zeus-green/20"
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && results.length === 0 && !loading && (
        <p className="px-3 py-2 text-xs text-slate-400">Sin resultados.</p>
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-slate-400"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
