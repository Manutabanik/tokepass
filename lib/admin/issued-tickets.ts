export type IssuedTicketUiStatus =
  | "available"
  | "checked_in"
  | "transferred"
  | "cancelled"

export type CustodyParty = {
  name: string
  email: string
  dni: string
}

export type CustodyTransferEvent = {
  at: string
  channel: "tokepass_transfer" | "admin_reassign" | "resale"
  from: CustodyParty
  to: CustodyParty
  fromTicketCode: string
  toTicketCode: string
  fromTicketId: string
  toTicketId: string
}

export type IssuedTicketRow = {
  id: string
  code: string
  holderName: string
  holderEmail: string
  holderDni: string
  sectorLabel: string
  status: IssuedTicketUiStatus
  checkedInAt: string | null
  purchasedAt: string
  ticketUrl: string
  /** Compra de prueba (Modo Sandbox). */
  isTest: boolean
  /** Comprador original de la cadena (nunca cambia). */
  originalBuyer: CustodyParty
  /** Si este QR fue invalidado por transferencia, apunta al nuevo titular. */
  transferredTo: {
    name: string
    code: string
    ticketId: string
  } | null
  /** Si este QR nació de una transferencia, apunta al ticket origen. */
  receivedFrom: {
    name: string
    code: string
    ticketId: string
  } | null
  custodyChain: CustodyTransferEvent[]
}

export type IssuedTicketMetrics = {
  totalIssued: number
  checkedIn: number
  pending: number
  transferred: number
}

export function matchesIssuedTicketQuery(
  ticket: IssuedTicketRow,
  query: string,
): boolean {
  const q = query.trim().toLocaleLowerCase("es")
  if (!q) return true
  const haystack = [
    ticket.holderName,
    ticket.holderEmail,
    ticket.holderDni,
    ticket.code,
    ticket.sectorLabel,
    ticket.originalBuyer.name,
    ticket.originalBuyer.email,
    ticket.originalBuyer.dni,
    ticket.transferredTo?.name,
    ticket.transferredTo?.code,
    ticket.receivedFrom?.name,
    ticket.receivedFrom?.code,
    ...ticket.custodyChain.flatMap((event) => [
      event.from.name,
      event.to.name,
      event.fromTicketCode,
      event.toTicketCode,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("es")
  return haystack.includes(q.replace(/^#/, ""))
}

export function formatCheckInLabel(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null

  const time = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date)

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())

  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)

  if (day === today) return `Hoy ${time} hs`
  return `${day} ${time} hs`
}

export function custodyChannelLabel(
  channel: CustodyTransferEvent["channel"],
): string {
  if (channel === "admin_reassign") return "Reasignado por el organizador"
  if (channel === "resale") return "Revendido a través de Tokepass"
  return "Transferido a través de Tokepass"
}

export function ticketDisplayCode(ticketId: string): string {
  return `TK-${ticketId.replace(/-/g, "").slice(0, 8).toUpperCase()}`
}
