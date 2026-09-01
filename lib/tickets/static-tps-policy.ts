import type { QrType, TicketIssuanceChannel } from "@/types/database"

/** HTTP 403 / vista de impresión: no hay TPS exportable para Living QR online. */
export const DIGITAL_TICKET_STATIC_EXPORT_MESSAGE =
  "Las entradas digitales solo son accesibles desde la app"

/** Puerta: TPS de una compra web en evento Living QR. */
export const STATIC_TPS_ONLINE_DYNAMIC_REJECT_MESSAGE =
  "QR estático no válido. Pedí el código vivo de la app."

export const STATIC_TPS_PAPER_CHANNELS = [
  "pos",
  "batch_print",
  "complimentary",
  "accreditation",
] as const satisfies readonly TicketIssuanceChannel[]

export class DigitalTicketStaticExportError extends Error {
  readonly status = 403 as const
  readonly code = "digital_ticket_static_export_forbidden"

  constructor(message = DIGITAL_TICKET_STATIC_EXPORT_MESSAGE) {
    super(message)
    this.name = "DigitalTicketStaticExportError"
  }
}

export function isLivingQrEvent(qrType: QrType | null | undefined): boolean {
  return qrType !== "static"
}

export function normalizeIssuanceChannel(
  channel: string | null | undefined,
): TicketIssuanceChannel {
  switch (channel) {
    case "pos":
    case "batch_print":
    case "complimentary":
    case "accreditation":
      return channel
    default:
      return "online"
  }
}

export function isPaperStaticTpsChannel(
  channel: string | null | undefined,
): boolean {
  return (STATIC_TPS_PAPER_CHANNELS as readonly string[]).includes(
    normalizeIssuanceChannel(channel),
  )
}

/**
 * PDF / Apple / Google Wallet / /tickets/[id]/print.
 * Evento Living QR + compra `online` → prohibido.
 * Papel (POS / imprenta / cortesía / acreditación) o evento estático → permitido.
 */
export function canExportStaticAdmissionArtifact(input: {
  qrType: QrType | null | undefined
  issuanceChannel: string | null | undefined
}): boolean {
  if (!isLivingQrEvent(input.qrType)) return true
  return isPaperStaticTpsChannel(input.issuanceChannel)
}

/**
 * Prefijo TPS. en puerta: mismo criterio que el export.
 * Sin canal conocido se trata como `online` (fail-closed).
 */
export function canAcceptStaticTpsAtDoor(input: {
  qrType: QrType | null | undefined
  issuanceChannel: string | null | undefined
}): boolean {
  return canExportStaticAdmissionArtifact(input)
}

export function assertStaticAdmissionExportAllowed(input: {
  qrType: QrType | null | undefined
  issuanceChannel: string | null | undefined
}): void {
  if (!canExportStaticAdmissionArtifact(input)) {
    throw new DigitalTicketStaticExportError()
  }
}

/** Usa `events.qr_type` (`eventQrType`) si está; no confiar en `is_dynamic_qr`. */
export function ticketAllowsStaticAdmissionExport(ticket: {
  eventQrType?: QrType | null
  qrType?: QrType | null
  issuanceChannel?: string | null
}): boolean {
  return canExportStaticAdmissionArtifact({
    qrType: ticket.eventQrType ?? ticket.qrType,
    issuanceChannel: ticket.issuanceChannel,
  })
}
