import type { ScannerEventOption } from "@/app/actions/scanner"
import type { ScannerGate } from "@/lib/scanner/gate"
import {
  ScannerSetupError,
  classifyScannerSetupError,
} from "@/lib/scanner/scanner-setup-error"

const SETUP_TIMEOUT_MS = 12_000
const MAX_ATTEMPTS = 3

type SetupOk = {
  ok: true
  events: ScannerEventOption[]
  operatorName: string
}

type GatesOk = {
  ok: true
  gates: ScannerGate[]
}

type SetupFail = {
  ok: false
  code?: string
  error?: string
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function fetchJson<T>(
  url: string,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), SETUP_TIMEOUT_MS)
  const onAbort = () => controller.abort()
  signal?.addEventListener("abort", onAbort)
  try {
    const response = await fetch(url, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
    const body = (await response.json().catch(() => null)) as
      | (T & SetupFail)
      | null
    if (response.status === 401) {
      throw new ScannerSetupError(
        "auth_required",
        body && "error" in body && body.error
          ? String(body.error)
          : "Sesión expirada. Volvé a iniciar sesión.",
      )
    }
    if (response.status === 403) {
      throw new ScannerSetupError(
        "forbidden",
        body && "error" in body && body.error
          ? String(body.error)
          : "No tenés permiso para controlar este evento.",
      )
    }
    if (!response.ok || !body || (body as SetupFail).ok === false) {
      const fail = body as SetupFail | null
      throw new ScannerSetupError(
        fail?.code === "auth_required"
          ? "auth_required"
          : fail?.code === "forbidden"
            ? "forbidden"
            : "network",
        fail?.error || `Error de red (${response.status})`,
      )
    }
    return body
  } catch (error) {
    if (error instanceof ScannerSetupError) throw error
    const classified = classifyScannerSetupError(error)
    throw new ScannerSetupError(classified.code, classified.message)
  } finally {
    window.clearTimeout(timer)
    signal?.removeEventListener("abort", onAbort)
  }
}

async function withRetry<T>(
  run: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (signal?.aborted) {
      throw new ScannerSetupError(
        "timeout",
        "La red tardó demasiado. Reintentá la conexión.",
      )
    }
    try {
      return await run()
    } catch (error) {
      lastError = error
      if (
        error instanceof ScannerSetupError &&
        (error.code === "auth_required" || error.code === "forbidden")
      ) {
        throw error
      }
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(400 * 2 ** attempt)
      }
    }
  }
  if (lastError instanceof ScannerSetupError) throw lastError
  const classified = classifyScannerSetupError(lastError)
  throw new ScannerSetupError(classified.code, classified.message)
}

export async function fetchScannerSetupCatalog(signal?: AbortSignal): Promise<{
  events: ScannerEventOption[]
  operatorName: string
}> {
  const body = await withRetry(
    () => fetchJson<SetupOk>("/api/scanner/setup", signal),
    signal,
  )
  return {
    events: Array.isArray(body.events) ? body.events : [],
    operatorName: body.operatorName?.trim() || "Operador",
  }
}

export async function fetchScannerGatesCatalog(
  eventId: string,
  signal?: AbortSignal,
): Promise<ScannerGate[]> {
  const id = eventId.trim()
  if (!id) return []
  const body = await withRetry(
    () =>
      fetchJson<GatesOk>(
        `/api/scanner/gates?eventId=${encodeURIComponent(id)}`,
        signal,
      ),
    signal,
  )
  return Array.isArray(body.gates) ? body.gates : []
}
