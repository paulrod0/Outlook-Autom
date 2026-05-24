import { NextResponse } from "next/server";
import { ensureSchema, getSql, isDbEnabled } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isDbEnabled()) {
    return NextResponse.json({ error: "DB no configurada" }, { status: 501 });
  }
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }
  try {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
      select id, name, data, updated_at from projects where id = ${id}
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    const r = rows[0];
    return NextResponse.json({
      id: r.id as string,
      name: r.name as string,
      savedAt: new Date(r.updated_at as string).toISOString(),
      data: r.data,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error de DB" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isDbEnabled()) {
    return NextResponse.json({ error: "DB no configurada" }, { status: 501 });
  }
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }
  try {
    await ensureSchema();
    const sql = getSql();
    await sql`delete from projects where id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error de DB" },
      { status: 500 },
    );
  }
}
