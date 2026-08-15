export const ALL_SCANNER_GATE_ID = "all"
export const GENERAL_SCANNER_GATE_ID = "general"
export const PARKING_SCANNER_GATE_ID = "parking"
export const VIP_SCANNER_GATE_ID = "vip"
export const GA_SCANNER_GATE_ID = "ga"

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

function gateAlias(value: string): string {
  return value.trim().toLowerCase()
}

function looksVip(value: string): boolean {
  return /\bvip\b/.test(gateAlias(value))
}

function looksGeneralAdmission(value: string): boolean {
  const alias = gateAlias(value)
  return (
    !looksVip(alias) &&
    (/\bcampo\b/.test(alias) ||
      /\bgeneral\b/.test(alias) ||
      alias === "ga" ||
      alias === GENERAL_SCANNER_GATE_ID)
  )
}

export function ticketMatchesScannerGate(
  gateId: string,
  ticket: { key: string; name: string; ticketType?: string | null },
): { ok: true } | { ok: false; correctSector: string } {
  const selected = gateId.trim() || ALL_SCANNER_GATE_ID
  const parkingPass = isParkingPassTicket(ticket.ticketType)

  if (selected === ALL_SCANNER_GATE_ID) {
    return { ok: true }
  }

  if (selected === PARKING_SCANNER_GATE_ID) {
    if (parkingPass) return { ok: true }
    return { ok: false, correctSector: "Puerta Principal" }
  }

  if (parkingPass) {
    return { ok: false, correctSector: "Barrera de Estacionamiento" }
  }

  if (selected === ticket.key) return { ok: true }
  if (gateAlias(selected) === gateAlias(ticket.name)) return { ok: true }

  if (selected === VIP_SCANNER_GATE_ID && looksVip(ticket.name)) {
    return { ok: true }
  }
  if (
    (selected === GA_SCANNER_GATE_ID || selected === GENERAL_SCANNER_GATE_ID) &&
    (ticket.key === GENERAL_SCANNER_GATE_ID || looksGeneralAdmission(ticket.name))
  ) {
    return { ok: true }
  }

  return { ok: false, correctSector: ticket.name }
}
