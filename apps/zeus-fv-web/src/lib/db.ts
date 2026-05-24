import "server-only";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * Cliente Neon (Postgres serverless). Sólo servidor.
 *
 * Se activa con la variable de entorno DATABASE_URL (cadena de conexión
 * de Neon, formato postgresql://user:pass@host/db?sslmode=require).
 *
 * Si no está definida, isDbEnabled() devuelve false y los Route Handlers
 * responden 501 para que el cliente caiga a localStorage.
 */

let cached: NeonQueryFunction<false, false> | null = null;

export function isDbEnabled(): boolean {
  return !!process.env.DATABASE_URL;
}

export function getSql(): NeonQueryFunction<false, false> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL no configurada");
  }
  if (!cached) {
    cached = neon(process.env.DATABASE_URL);
  }
  return cached;
}

let migrated = false;

/**
 * Crea la tabla si no existe. Idempotente; se ejecuta perezosamente en
 * la primera petición. Para producción seria conviene migraciones
 * versionadas, pero para el MVP esto es suficiente.
 */
export async function ensureSchema(): Promise<void> {
  if (migrated) return;
  const sql = getSql();
  await sql`
    create table if not exists projects (
      id          uuid primary key default gen_random_uuid(),
      name        text not null,
      client_name text,
      reference   text,
      address     text,
      data        jsonb not null,
      created_at  timestamptz not null default now(),
      updated_at  timestamptz not null default now()
    )
  `;
  migrated = true;
}
