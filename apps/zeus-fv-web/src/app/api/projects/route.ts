import { NextResponse } from "next/server";
import { ensureSchema, getSql, isDbEnabled } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/projects → lista de proyectos (sin el blob data completo).
export async function GET() {
  if (!isDbEnabled()) {
    return NextResponse.json({ error: "DB no configurada" }, { status: 501 });
  }
  try {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
      select id, name, client_name, reference, address, data, updated_at
      from projects
      order by updated_at desc
      limit 200
    `;
    const items = rows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      savedAt: new Date(r.updated_at as string).toISOString(),
      data: r.data,
    }));
    return NextResponse.json(items);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error de DB" },
      { status: 500 },
    );
  }
}

// POST /api/projects → crea un proyecto. Body: { name, data }.
export async function POST(req: Request) {
  if (!isDbEnabled()) {
    return NextResponse.json({ error: "DB no configurada" }, { status: 501 });
  }
  let body: { name?: string; data?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!body?.data || typeof body.data !== "object") {
    return NextResponse.json({ error: "Falta 'data'" }, { status: 400 });
  }

  const name = (body.name ?? "Sin título").toString().slice(0, 200);
  const data = body.data as Record<string, unknown>;
  const clientName = (data.clientName as string | undefined) ?? null;
  const reference = (data.reference as string | undefined) ?? null;
  const address = (data.address as string | undefined) ?? null;

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
      insert into projects (name, client_name, reference, address, data)
      values (${name}, ${clientName}, ${reference}, ${address}, ${JSON.stringify(data)})
      returning id, name, updated_at
    `;
    const r = rows[0];
    return NextResponse.json({
      id: r.id as string,
      name: r.name as string,
      savedAt: new Date(r.updated_at as string).toISOString(),
      data,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error de DB" },
      { status: 500 },
    );
  }
}
