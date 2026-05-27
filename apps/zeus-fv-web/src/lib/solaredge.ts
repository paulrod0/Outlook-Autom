import "server-only";

/**
 * Cliente de la SolarEdge Monitoring API.
 *
 * Sólo lee de plantas ya instaladas con inversor SolarEdge. No diseña ni
 * dibuja paneles (ver §13 del documento de arquitectura).
 *
 * Auth: API Key a nivel de cuenta vía `SOLAREDGE_API_KEY` (env). Si no
 * está definida, isSolarEdgeEnabled() devuelve false y los Route Handlers
 * responden 501.
 *
 * Rate-limit: 300 peticiones/día por token de cuenta, 3 concurrentes por IP.
 * Conviene cachear (lo hacemos en Neon) y sincronizar de noche por cron.
 */

const DEFAULT_BASE_URL = "https://monitoringapi.solaredge.com";

export function isSolarEdgeEnabled(): boolean {
  return !!process.env.SOLAREDGE_API_KEY;
}

function apiKey(): string {
  const k = process.env.SOLAREDGE_API_KEY;
  if (!k) throw new Error("SOLAREDGE_API_KEY no configurada");
  return k;
}

function baseUrl(): string {
  return process.env.SOLAREDGE_BASE_URL?.replace(/\/+$/, "") ?? DEFAULT_BASE_URL;
}

async function get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const url = new URL(baseUrl() + path);
  url.searchParams.set("api_key", apiKey());
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    // No cache: gestionamos persistencia/caché nosotros en Neon.
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`SolarEdge ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

// --- Tipos de respuesta (subset, lo que usamos) ---

export type SolarEdgeSite = {
  id: number;
  name: string;
  peakPower: number; // kWp instalados
  installationDate?: string; // YYYY-MM-DD
  status?: string; // "Active" | ...
  location?: {
    country?: string;
    city?: string;
    address?: string;
    zip?: string;
  };
};

type SitesListResponse = {
  sites: {
    count: number;
    site: SolarEdgeSite[];
  };
};

type SiteDetailsResponse = {
  details: SolarEdgeSite;
};

type EnergyResponse = {
  energy: {
    timeUnit: "DAY" | "MONTH" | "YEAR" | "QUARTER_OF_AN_HOUR" | "HOUR";
    unit: "Wh" | "kWh";
    values: Array<{ date: string; value: number | null }>;
  };
};

type OverviewResponse = {
  overview: {
    lastUpdateTime: string;
    lifeTimeData: { energy: number };
    lastYearData: { energy: number };
    lastMonthData: { energy: number };
    lastDayData: { energy: number };
    currentPower: { power: number };
  };
};

// --- API pública ---

export async function listSites(): Promise<SolarEdgeSite[]> {
  const data = await get<SitesListResponse>("/sites/list", { size: 100 });
  return data.sites.site;
}

export async function getSite(siteId: number): Promise<SolarEdgeSite> {
  const data = await get<SiteDetailsResponse>(`/site/${siteId}/details`);
  return data.details;
}

export async function getSiteOverview(siteId: number): Promise<OverviewResponse["overview"]> {
  const data = await get<OverviewResponse>(`/site/${siteId}/overview`);
  return data.overview;
}

export async function getDailyEnergy(
  siteId: number,
  startDate: string,
  endDate: string,
): Promise<Array<{ date: string; energyKwh: number }>> {
  const data = await get<EnergyResponse>(`/site/${siteId}/energy`, {
    timeUnit: "DAY",
    startDate,
    endDate,
  });
  const factor = data.energy.unit === "Wh" ? 1 / 1000 : 1;
  return data.energy.values.map((v) => ({
    date: v.date.slice(0, 10),
    energyKwh: (v.value ?? 0) * factor,
  }));
}
