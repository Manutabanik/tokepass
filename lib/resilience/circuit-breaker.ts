export const EXTERNAL_FETCH_TIMEOUT_MS = 8_000
export const CIRCUIT_FAILURE_THRESHOLD = 5
export const CIRCUIT_FAILURE_WINDOW_MS = 30_000
export const CIRCUIT_OPEN_MS = 20_000

export type CircuitName =
  | "mercadopago"
  | "resend"
  | "sendgrid"
  | "whatsapp"
  | "naranjax"
  | "payway"

type CircuitState = "closed" | "open" | "half_open"

type Circuit = {
  state: CircuitState
  failures: number[]
  openedAt: number
  halfOpenInFlight: boolean
}

const circuits = new Map<CircuitName, Circuit>()

export class CircuitOpenError extends Error {
  readonly code = "circuit_open" as const

  constructor(readonly provider: CircuitName) {
    super(
      `El proveedor ${provider} no esta disponible. Reintenta en unos segundos.`,
    )
    this.name = "CircuitOpenError"
  }
}

function bucket(name: CircuitName): Circuit {
  const existing = circuits.get(name)
  if (existing) return existing
  const created: Circuit = {
    state: "closed",
    failures: [],
    openedAt: 0,
    halfOpenInFlight: false,
  }
  circuits.set(name, created)
  return created
}

function prune(circuit: Circuit, now: number) {
  circuit.failures = circuit.failures.filter(
    (stamp) => now - stamp < CIRCUIT_FAILURE_WINDOW_MS,
  )
}

function transition(circuit: Circuit, now: number) {
  if (circuit.state === "open" && now - circuit.openedAt >= CIRCUIT_OPEN_MS) {
    circuit.state = "half_open"
    circuit.halfOpenInFlight = false
  }
}

export function allowCircuit(name: CircuitName, now = Date.now()): boolean {
  const circuit = bucket(name)
  transition(circuit, now)
  if (circuit.state === "open") return false
  if (circuit.state === "half_open") {
    if (circuit.halfOpenInFlight) return false
    circuit.halfOpenInFlight = true
    return true
  }
  return true
}

export function recordCircuitSuccess(name: CircuitName): void {
  const circuit = bucket(name)
  circuit.state = "closed"
  circuit.failures = []
  circuit.halfOpenInFlight = false
}

export function recordCircuitFailure(name: CircuitName, now = Date.now()): void {
  const circuit = bucket(name)
  prune(circuit, now)
  circuit.failures.push(now)
  circuit.halfOpenInFlight = false
  if (
    circuit.failures.length >= CIRCUIT_FAILURE_THRESHOLD ||
    circuit.state === "half_open"
  ) {
    circuit.state = "open"
    circuit.openedAt = now
  }
}

export function isTransientHttpStatus(status: number): boolean {
  return status >= 500 || status === 408 || status === 429
}

export function externalFetchSignal(): AbortSignal {
  return AbortSignal.timeout(EXTERNAL_FETCH_TIMEOUT_MS)
}

export async function withCircuit<T>(
  name: CircuitName,
  fn: () => Promise<T>,
): Promise<T> {
  if (!allowCircuit(name)) {
    throw new CircuitOpenError(name)
  }
  try {
    const result = await fn()
    recordCircuitSuccess(name)
    return result
  } catch (error) {
    recordCircuitFailure(name)
    throw error
  }
}

export async function circuitFetch(
  name: CircuitName,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (!allowCircuit(name)) {
    throw new CircuitOpenError(name)
  }
  try {
    const response = await fetch(input, {
      ...init,
      signal: init?.signal ?? externalFetchSignal(),
    })
    if (isTransientHttpStatus(response.status)) {
      recordCircuitFailure(name)
    } else {
      recordCircuitSuccess(name)
    }
    return response
  } catch (error) {
    recordCircuitFailure(name)
    throw error
  }
}

export function resetCircuitsForTests(): void {
  circuits.clear()
}
