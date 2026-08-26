const DIRECT_DB_PORT = "5432"
const TRANSACTION_POOLER_PORT = "6543"

export const TRANSACTIONAL_POOLER_PORT = Number(TRANSACTION_POOLER_PORT)

/**
 * Serverless (Vercel) debe hablar con Postgres vía Supavisor transaccional
 * (puerto 6543). El 5432 directo agota `max_connections` en picos.
 */
export function resolvePooledDatabaseUrl(
  raw: string | null | undefined,
): string | null {
  const value = raw?.trim() ?? ""
  if (!value) return null

  try {
    const url = new URL(value)
    if (url.port === DIRECT_DB_PORT || url.port === "") {
      url.port = TRANSACTION_POOLER_PORT
    }
    if (!url.searchParams.has("pgbouncer")) {
      url.searchParams.set("pgbouncer", "true")
    }
    if (!url.searchParams.has("sslmode")) {
      url.searchParams.set("sslmode", "require")
    }
    return url.toString()
  } catch {
    return null
  }
}

export function isTransactionalPoolerUrl(
  raw: string | null | undefined,
): boolean {
  const value = raw?.trim() ?? ""
  if (!value) return false
  try {
    const url = new URL(value)
    return url.port === TRANSACTION_POOLER_PORT
  } catch {
    return false
  }
}

export function resolveServerDatabaseUrl(): string | null {
  return resolvePooledDatabaseUrl(
    process.env.SUPABASE_DB_POOLER_URL ??
      process.env.DATABASE_URL ??
      process.env.SUPABASE_DB_URL ??
      process.env.POSTGRES_URL,
  )
}
