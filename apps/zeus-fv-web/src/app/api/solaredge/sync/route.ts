import { NextResponse } from "next/server";
import { ensureSchema, getSql, isDbEnabled } from "@/lib/db";
import { getDailyEnergy, isSolarEdgeEnabled } from "@/lib/solaredge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Endpoint de sincronización SolarEdge → Neon.
 *
 * Pensado para ser invocado por el cron de Vercel (ver vercel.json).
 * Para invocación manual desde scripts/CRM puede protegerse con un
 * header `Authorization: Bearer ${CRON_SECRET}` cuando la var esté
 * definida. Vercel Cron envía automáticamente ese header en producción.
 */

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // sin secreto configurado, permitir (dev)
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isDbEnabled()) {
    return NextResponse.json({ error: "DB no configurada" }, { status: 501 });
  }
  if (!isSolarEdgeEnabled()) {
    return NextResponse.json(
      { error: "SOLAREDGE_API_KEY no configurada" },
      { status: 501 },
    );
  }

  try {
    await ensureSchema();
    const sql = getSql();

    const sites = await sql`
      select id, se_site_id, last_sync_at, commissioned_at
      from solaredge_sites
    `;

    const today = new Date();
    const summary: Array<{
      seSiteId: number;
      days: number;
      from: string;
      to: string;
    }> = [];

    for (const s of sites) {
      const seId = Number(s.se_site_id);
      const lastSync = s.last_sync_at ? new Date(s.last_sync_at as string) : null;
      const commissioned = s.commissioned_at
        ? new Date(s.commissioned_at as string)
        : null;

      // Punto de partida: último sync menos 1 día (para reescribir el día
      // parcial), si no, fecha de puesta en marcha, si no, 30 días atrás.
      const fallback = new Date(today.getTime() - 30 * 86400000);
      const startCandidates = [lastSync ? new Date(lastSync.getTime() - 86400000) : null, commissioned, fallback]
        .filter((d): d is Date => d !== null);
      const start = new Date(
        Math.max(...startCandidates.map((d) => d.getTime())),
      );
      if (start.getTime() > today.getTime()) continue;

      const energy = await getDailyEnergy(seId, ymd(start), ymd(today));
      for (const e of energy) {
        if (e.energyKwh <= 0) continue;
        await sql`
          insert into solaredge_energy_daily (site_id, day, energy_kwh)
          values (${s.id as string}, ${e.date}, ${e.energyKwh})
          on conflict (site_id, day) do update set energy_kwh = excluded.energy_kwh
        `;
      }
      await sql`
        update solaredge_sites set last_sync_at = now() where id = ${s.id as string}
      `;
      summary.push({
        seSiteId: seId,
        days: energy.length,
        from: ymd(start),
        to: ymd(today),
      });
    }

    return NextResponse.json({ ok: true, synced: summary });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}
