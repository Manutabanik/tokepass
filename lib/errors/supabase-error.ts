export function isUnmaskedSupabaseError(value: unknown): value is string {
  return typeof value === "string" && value.includes("[SUPABASE ERROR")
}

/**
 * Error crudo de PostgREST/Supabase. No enmascarar en wizard, mapa ni persist.
 */
export function formatSupabaseError(error: unknown): string {
  if (isUnmaskedSupabaseError(error)) return error

  if (error && typeof error === "object") {
    const row = error as {
      message?: unknown
      details?: unknown
      code?: unknown
      hint?: unknown
      error?: unknown
    }
    const code = row.code == null || row.code === "" ? "N/A" : String(row.code)
    const message =
      (typeof row.message === "string" && row.message.trim()) ||
      (typeof row.error === "string" && row.error.trim()) ||
      (code !== "N/A" ? code : String(error))
    const details =
      (typeof row.details === "string" && row.details.trim()) ||
      (typeof row.hint === "string" && row.hint.trim()) ||
      "N/A"
    return `[SUPABASE ERROR - Code: ${code}]: ${message}. Details: ${details}`
  }

  if (error instanceof Error) {
    return `[SUPABASE ERROR - Code: N/A]: ${error.message}. Details: N/A`
  }

  return `[SUPABASE ERROR - Code: N/A]: ${String(error)}. Details: N/A`
}
