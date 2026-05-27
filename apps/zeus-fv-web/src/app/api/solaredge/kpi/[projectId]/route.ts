import { NextResponse } from "next/server";
import { ensureSchema, getSql, isDbEnabled } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/solaredge/kpi/{projectId}
 *
 * Devuelve KPI real vs estimado para un proyecto vinculado a un sitio
 * SolarEdge. El estimado se lee del propio snapshot del proyecto
 * (pvgis.yearlyKwh). El real se calcula sumando los últimos 365 días
 * de `solaredge_energy_daily` (o desde commissioned_at si es más reciente).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  if (!isDbEnabled()) {
    return NextResponse.json({ error: "DB no configurada" }, { status: 501 });
  }
  const { projectId } = await params;
  if (!UUID_RE.test(projectId)) {
    return NextResponse.json({ error: "projectId inválido" }, { status: 400 });
  }

  try {
    await ensureSchema();
    const sql = getSql();

    const projectRows = await sql`
      select data from projects where id = ${projectId}
    `;
    if (projectRows.length === 0) {
      return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    }
    const data = projectRows[0].data as { pvgis?: { yearlyKwh?: number } };
    const estimatedKwh = data?.pvgis?.yearlyKwh ?? null;

    const siteRows = await sql`
      select id, se_site_id, name, commissioned_at, last_sync_at
      from solaredge_sites
      where project_id = ${projectId}
      limit 1
    `;
    if (siteRows.length === 0) {
      return NextResponse.json({ estimatedKwh, linked: false });
    }
    const site = siteRows[0];

    const energyRows = await sql`
      select coalesce(sum(energy_kwh), 0) as total,
             min(day) as first_day,
             max(day) as last_day,
             count(*) as days
      from solaredge_energy_daily
      where site_id = ${site.id as string}
        and day >= (current_date - interval '365 days')
    `;
    const total = Number(energyRows[0].total) || 0;
    const days = Number(energyRows[0].days) || 0;

    // Si llevamos menos de un año monitorizando, extrapolamos linealmente.
    const realKwhAnnualised = days > 0 ? Math.round((total * 365) / days) : 0;
    const kpiPct =
      estimatedKwh && estimatedKwh > 0
        ? Math.round((realKwhAnnualised / estimatedKwh) * 100)
        : null;

    return NextResponse.json({
      linked: true,
      site: {
        id: site.id,
        seSiteId: Number(site.se_site_id),
        name: site.name,
        commissionedAt: site.commissioned_at,
        lastSyncAt: site.last_sync_at,
      },
      estimatedKwh,
      realKwhWindow: total,
      realKwhAnnualised,
      windowDays: days,
      windowFirstDay: energyRows[0].first_day,
      windowLastDay: energyRows[0].last_day,
      kpiPct,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}
