export const GENERAL_SCANNER_GATE_ID = "general"
export const PARKING_SCANNER_GATE_ID = "parking"

export type TicketAccessKind = "admission" | "parking" | "access_pass"

export type ScannerGate = {
  id: string
  label: string
  color: string
  kind: "general" | "sector" | "parking"
}

export function isParkingPassTicket(
  ticketType?: string | null,
): boolean {
  const kind = (ticketType ?? "admission").trim()
  return kind === "parking" || kind === "access_pass"
}

export function resolveTicketSectorKey(input: {
  seatingSectorId?: string | null
  seatingSectorName?: string | null
  tierSeatingSectorId?: string | null
}): { key: string; name: string } {
  const unitKey = input.seatingSectorId?.trim()
  if (unitKey) {
    return {
      key: unitKey,
      name: input.seatingSectorName?.trim() || unitKey,
    }
  }
  const tierKey = input.tierSeatingSectorId?.trim()
  if (tierKey) {
    return { key: tierKey, name: input.seatingSectorName?.trim() || tierKey }
  }
  return { key: GENERAL_SCANNER_GATE_ID, name: "Acceso General" }
}

export function ticketMatchesScannerGate(
  gateId: string,
  ticket: { key: string; name: string; ticketType?: string | null },
): { ok: true } | { ok: false; correctSector: string } {
  const selected = gateId.trim() || GENERAL_SCANNER_GATE_ID
  const parkingPass = isParkingPassTicket(ticket.ticketType)

  if (selected === PARKING_SCANNER_GATE_ID) {
    if (parkingPass) return { ok: true }
    return { ok: false, correctSector: "Acceso General / sector de entrada" }
  }

  if (parkingPass) {
    return { ok: false, correctSector: "Barrera de Estacionamiento" }
  }

  if (selected === ticket.key) return { ok: true }
  return { ok: false, correctSector: ticket.name }
}
