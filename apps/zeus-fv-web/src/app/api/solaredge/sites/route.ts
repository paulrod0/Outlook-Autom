import { NextResponse } from "next/server";
import { ensureSchema, getSql, isDbEnabled } from "@/lib/db";
import { getSite, isSolarEdgeEnabled, listSites } from "@/lib/solaredge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/solaredge/sites
// Lista los sitios ya vinculados en local + (opcional) refresca contra SolarEdge.
// Si SOLAREDGE_API_KEY no está, devolvemos sólo los locales (sin refrescar).
export async function GET(req: Request) {
  if (!isDbEnabled()) {
    return NextResponse.json({ error: "DB no configurada" }, { status: 501 });
  }
  const url = new URL(req.url);
  const refresh = url.searchParams.get("refresh") === "1";

  try {
    await ensureSchema();
    const sql = getSql();

    if (refresh && isSolarEdgeEnabled()) {
      const sites = await listSites();
      for (const s of sites) {
        // /sites/list a veces devuelve peakPower=0; el dato fiable está en
        // /site/{id}/details. Enriquecemos si falta o es 0.
        let peakKwp = s.peakPower;
        if (!peakKwp || peakKwp === 0) {
          try {
            const detail = await getSite(s.id);
            peakKwp = detail.peakPower || peakKwp;
          } catch {
            // si /details falla, dejamos el valor 0 — un cron posterior lo refresca
          }
        }
        await sql`
          insert into solaredge_sites
            (se_site_id, name, installed_kwp, commissioned_at)
          values
            (${s.id}, ${s.name}, ${peakKwp}, ${s.installationDate ?? null})
          on conflict (se_site_id) do update set
            name = excluded.name,
            installed_kwp = case
              when excluded.installed_kwp > 0 then excluded.installed_kwp
              else solaredge_sites.installed_kwp
            end,
            commissioned_at = coalesce(excluded.commissioned_at, solaredge_sites.commissioned_at)
        `;
      }
    }

    const rows = await sql`
      select id, project_id, se_site_id, name, installed_kwp,
             commissioned_at, last_sync_at
      from solaredge_sites
      order by name nulls last, se_site_id
    `;
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}

// POST /api/solaredge/sites
// Body: { seSiteId: number, projectId?: string }
// Vincula manualmente un sitio SolarEdge a un proyecto del CRM interno.
export async function POST(req: Request) {
  if (!isDbEnabled()) {
    return NextResponse.json({ error: "DB no configurada" }, { status: 501 });
  }
  let body: { seSiteId?: number; projectId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const seSiteId = Number(body?.seSiteId);
  if (!Number.isFinite(seSiteId) || seSiteId <= 0) {
    return NextResponse.json({ error: "seSiteId inválido" }, { status: 400 });
  }
  const projectId = body.projectId ?? null;
  if (projectId !== null && !UUID_RE.test(projectId)) {
    return NextResponse.json({ error: "projectId inválido" }, { status: 400 });
  }

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
      insert into solaredge_sites (se_site_id, project_id)
      values (${seSiteId}, ${projectId})
      on conflict (se_site_id) do update set project_id = excluded.project_id
      returning id, project_id, se_site_id, name, installed_kwp,
                commissioned_at, last_sync_at
    `;
    return NextResponse.json(rows[0]);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}
