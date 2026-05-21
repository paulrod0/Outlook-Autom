export type GeocodeResult = {
  label: string;
  lat: number;
  lon: number;
  raw: unknown;
};

/**
 * Geocodifica una dirección libre usando Nominatim (OpenStreetMap).
 *
 * Política de Nominatim: máx. 1 req/s, requiere User-Agent identificable.
 * En producción se moverá a una Route Handler / Edge Function para añadir
 * caché y rate-limit, evitando exponer la app al límite por IP.
 */
export async function geocodeAddress(query: string): Promise<GeocodeResult[]> {
  if (!query.trim()) return [];

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "6");
  url.searchParams.set("countrycodes", "es");
  url.searchParams.set("accept-language", "es");

  const res = await fetch(url, {
    headers: {
      "Accept-Language": "es",
    },
  });

  if (!res.ok) return [];

  const data = (await res.json()) as Array<{
    display_name: string;
    lat: string;
    lon: string;
  }>;

  return data.map((d) => ({
    label: d.display_name,
    lat: parseFloat(d.lat),
    lon: parseFloat(d.lon),
    raw: d,
  }));
}
