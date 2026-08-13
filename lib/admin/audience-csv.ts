import type { IssuedTicketRow, IssuedTicketUiStatus } from "@/lib/admin/issued-tickets"

const CSV_HEADERS = [
  "Nombre del Titular",
  "Email",
  "DNI/Documento",
  "Sector/Tipo de Entrada",
  "Estado",
  "Fecha de Compra",
] as const

function csvStatusLabel(status: IssuedTicketUiStatus): string | null {
  switch (status) {
    case "available":
      return "Válido"
    case "checked_in":
      return "Ingresó"
    case "transferred":
      return "Transferido"
    default:
      return null
  }
}

function escapeCsvCell(value: string): string {
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`
  }
  return normalized
}

function formatPurchaseDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date)
}

/** Filas de audiencia exportables (sin anuladas). */
export function audienceRowsFromTickets(
  tickets: IssuedTicketRow[],
): IssuedTicketRow[] {
  return tickets.filter((ticket) => csvStatusLabel(ticket.status) != null)
}

/** CSV UTF-8 (sin BOM; el BOM se antepone al descargar). */
export function buildAudienceCsv(tickets: IssuedTicketRow[]): string {
  const rows = audienceRowsFromTickets(tickets).map((ticket) => {
    const status = csvStatusLabel(ticket.status) ?? ""
    return [
      ticket.holderName || "",
      ticket.holderEmail || "",
      ticket.holderDni || "",
      ticket.sectorLabel || "",
      status,
      formatPurchaseDate(ticket.purchasedAt),
    ]
      .map((cell) => escapeCsvCell(String(cell)))
      .join(",")
  })

  return [CSV_HEADERS.join(","), ...rows].join("\r\n")
}

export function audienceCsvFilename(eventTitle: string, eventId: string): string {
  const slug = eventTitle
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48)
    .toLowerCase()

  const safe = slug || eventId.slice(0, 8)
  return `audiencia_evento_${safe}.csv`
}

/** Prefijo BOM para Excel (Windows). */
export function withUtf8Bom(csvBody: string): string {
  return `\uFEFF${csvBody}`
}
