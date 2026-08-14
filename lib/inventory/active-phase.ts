export const PHASE_ROLLOVER_MESSAGE =
  "La fase de venta acaba de agotarse. El carrito se actualizó con el nuevo precio disponible."

export const PHASE_STOCK_CLAMP_MESSAGE =
  "El stock de esta fase no alcanza para tu selección. Actualizamos la cantidad disponible."

export type PublicTicketPhase = {
  id: string
  name: string
  price: number
  capacityLimit: number | null
  sold: number
  startTime: string | null
  endTime: string | null
  status: "scheduled" | "active" | "sold_out"
}

export type PhaseRolloverInfo = {
  tierId: string
  phaseId: string | null
  phaseName: string
  price: number
  available: number
  message: string
}

export function sortTicketPhases(
  phases: PublicTicketPhase[],
): PublicTicketPhase[] {
  return [...phases].sort((left, right) => {
    const leftTime = left.startTime
      ? Date.parse(left.startTime)
      : Number.POSITIVE_INFINITY
    const rightTime = right.startTime
      ? Date.parse(right.startTime)
      : Number.POSITIVE_INFINITY
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return leftTime - rightTime
    }
    if (Number.isFinite(leftTime) !== Number.isFinite(rightTime)) {
      return Number.isFinite(leftTime) ? -1 : 1
    }
    return left.name.localeCompare(right.name, "es")
  })
}

export function phaseRemaining(phase: PublicTicketPhase): number {
  if (phase.capacityLimit == null) return Number.POSITIVE_INFINITY
  return Math.max(0, phase.capacityLimit - phase.sold)
}

export function isPhaseInWindow(
  phase: PublicTicketPhase,
  now = Date.now(),
): boolean {
  if (phase.startTime) {
    const start = Date.parse(phase.startTime)
    if (Number.isFinite(start) && start > now) return false
  }
  if (phase.endTime) {
    const end = Date.parse(phase.endTime)
    if (Number.isFinite(end) && end <= now) return false
  }
  return true
}

export function resolveSalePhases(
  phases: PublicTicketPhase[] | undefined,
  now = Date.now(),
) {
  const sorted = sortTicketPhases(phases ?? [])
  const displayActive =
    sorted.find(
      (phase) =>
        phase.status === "active" &&
        phaseRemaining(phase) > 0 &&
        isPhaseInWindow(phase, now),
    ) ?? null

  const sellable =
    displayActive ??
    sorted.find(
      (phase) =>
        phase.status === "scheduled" &&
        isPhaseInWindow(phase, now) &&
        phaseRemaining(phase) > 0,
    ) ??
    null

  const current = displayActive ?? sellable
  const upcoming = sorted.filter(
    (phase) =>
      phase.id !== current?.id &&
      phase.status !== "sold_out" &&
      phaseRemaining(phase) > 0,
  )

  return { displayActive, sellable, current, upcoming }
}

export function applyActivePhaseToTier(
  tier: { price: number; available: number },
  phases: PublicTicketPhase[] | undefined,
  now = Date.now(),
) {
  const resolved = resolveSalePhases(phases, now)
  if (!phases?.length) {
    return {
      price: tier.price,
      available: Math.max(0, tier.available),
      ...resolved,
    }
  }
  if (!resolved.current) {
    return {
      price: tier.price,
      available: 0,
      ...resolved,
    }
  }
  const remaining = phaseRemaining(resolved.current)
  return {
    price: resolved.current.price,
    available: Number.isFinite(remaining)
      ? Math.min(Math.max(0, tier.available), remaining)
      : Math.max(0, tier.available),
    ...resolved,
  }
}

export type PhaseCartDecision =
  | { kind: "ok"; phase: PublicTicketPhase }
  | { kind: "next"; phase: PublicTicketPhase; from: PublicTicketPhase | null }
  | { kind: "clamp"; phase: PublicTicketPhase; remaining: number }
  | { kind: "sold_out" }

export function decidePhaseCart(
  phases: PublicTicketPhase[] | undefined,
  quantity: number,
  now = Date.now(),
): PhaseCartDecision {
  const { sellable, upcoming } = resolveSalePhases(phases, now)
  if (!sellable) {
    const next = upcoming[0]
    if (next) return { kind: "next", phase: next, from: null }
    return { kind: "sold_out" }
  }

  const remaining = phaseRemaining(sellable)
  if (!Number.isFinite(remaining) || quantity <= remaining) {
    return { kind: "ok", phase: sellable }
  }

  const next =
    upcoming.find((phase) => phaseRemaining(phase) > 0) ?? upcoming[0] ?? null
  if (next) return { kind: "next", phase: next, from: sellable }
  return { kind: "clamp", phase: sellable, remaining }
}

export function applyPhaseRolloverToPhases(
  phases: PublicTicketPhase[] | undefined,
  nextPhaseId: string | null,
): PublicTicketPhase[] {
  if (!phases?.length) return []
  return phases.map((phase) => {
    if (nextPhaseId && phase.id === nextPhaseId) {
      return { ...phase, status: "active" as const }
    }
    if (phase.status === "active") {
      return {
        ...phase,
        status: "sold_out" as const,
        sold: phase.capacityLimit ?? phase.sold,
      }
    }
    return phase
  })
}

export function isPhaseStockError(message: string): boolean {
  return /fase de venta|ticket_tier_phase/i.test(message)
}

export function isMissingPhasesSchema(message: string): boolean {
  return /ticket_tier_phases|reserve_tickets_atomic|assert_cascade_stock_available|schema cache|PGRST202|PGRST204|42703|42883/i.test(
    message,
  )
}

export function mapPublicPhaseRow(row: {
  id: string
  name: string | null
  price: number | string | null
  capacity_limit: number | null
  sold: number | string | null
  start_time: string | null
  end_time: string | null
  status: string | null
}): PublicTicketPhase {
  const status =
    row.status === "active" || row.status === "sold_out" || row.status === "scheduled"
      ? row.status
      : "scheduled"
  return {
    id: row.id,
    name: String(row.name ?? "Lote").trim() || "Lote",
    price: Number(row.price) || 0,
    capacityLimit:
      row.capacity_limit == null ? null : Math.max(0, Number(row.capacity_limit) || 0),
    sold: Math.max(0, Number(row.sold) || 0),
    startTime: row.start_time,
    endTime: row.end_time,
    status,
  }
}
