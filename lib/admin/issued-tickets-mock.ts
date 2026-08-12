export type IssuedTicketUiStatus = "available" | "checked_in" | "cancelled"

export type IssuedTicketRow = {
  id: string
  code: string
  holderName: string
  holderEmail: string
  holderDni: string
  sectorLabel: string
  status: IssuedTicketUiStatus
  checkedInAt: string | null
  ticketUrl: string
}

/** Mock completo para probar buscador, filtros y acciones en el panel. */
export const MOCK_ISSUED_TICKETS: IssuedTicketRow[] = [
  {
    id: "tkt-001",
    code: "TK-84920",
    holderName: "Valentina Rossi",
    holderEmail: "valen.rossi@gmail.com",
    holderDni: "38451223",
    sectorLabel: "Sector Naranja · Fila 2 · Mesa 5",
    status: "available",
    checkedInAt: null,
    ticketUrl: "https://www.tokepass.com.ar/tickets/tkt-001",
  },
  {
    id: "tkt-002",
    code: "TK-84921",
    holderName: "Martín Alegre",
    holderEmail: "martin.alegre@outlook.com",
    holderDni: "30112887",
    sectorLabel: "Campo General",
    status: "checked_in",
    checkedInAt: "2026-08-12T21:15:00.000-03:00",
    ticketUrl: "https://www.tokepass.com.ar/tickets/tkt-002",
  },
  {
    id: "tkt-003",
    code: "TK-85002",
    holderName: "Lucía Fernández",
    holderEmail: "lucia.fernandez@hotmail.com",
    holderDni: "42776110",
    sectorLabel: "VIP Platea · Fila 1 · Butaca 12",
    status: "available",
    checkedInAt: null,
    ticketUrl: "https://www.tokepass.com.ar/tickets/tkt-003",
  },
  {
    id: "tkt-004",
    code: "TK-85018",
    holderName: "Joaquín Méndez",
    holderEmail: "joaco.mendez@yahoo.com",
    holderDni: "35990441",
    sectorLabel: "Sector Azul · Fila 8 · Mesa 3",
    status: "cancelled",
    checkedInAt: null,
    ticketUrl: "https://www.tokepass.com.ar/tickets/tkt-004",
  },
  {
    id: "tkt-005",
    code: "TK-85144",
    holderName: "Camila Soto",
    holderEmail: "cami.soto@gmail.com",
    holderDni: "41200358",
    sectorLabel: "Campo General",
    status: "checked_in",
    checkedInAt: "2026-08-12T22:03:00.000-03:00",
    ticketUrl: "https://www.tokepass.com.ar/tickets/tkt-005",
  },
  {
    id: "tkt-006",
    code: "TK-85201",
    holderName: "Diego Palacios",
    holderEmail: "diego.palacios@tokepass.test",
    holderDni: "27884512",
    sectorLabel: "Palco Oro · Mesa 1",
    status: "available",
    checkedInAt: null,
    ticketUrl: "https://www.tokepass.com.ar/tickets/tkt-006",
  },
  {
    id: "tkt-007",
    code: "TK-85277",
    holderName: "Sofía Navarro",
    holderEmail: "sofia.navarro@icloud.com",
    holderDni: "39881204",
    sectorLabel: "Sector Naranja · Fila 4 · Mesa 9",
    status: "available",
    checkedInAt: null,
    ticketUrl: "https://www.tokepass.com.ar/tickets/tkt-007",
  },
  {
    id: "tkt-008",
    code: "TK-85330",
    holderName: "Nicolás Ruiz",
    holderEmail: "nico.ruiz@gmail.com",
    holderDni: "33501998",
    sectorLabel: "Campo General",
    status: "checked_in",
    checkedInAt: "2026-08-12T20:47:00.000-03:00",
    ticketUrl: "https://www.tokepass.com.ar/tickets/tkt-008",
  },
  {
    id: "tkt-009",
    code: "TK-85412",
    holderName: "Agustina Paredes",
    holderEmail: "agus.paredes@proton.me",
    holderDni: "44110233",
    sectorLabel: "VIP Platea · Fila 3 · Butaca 7",
    status: "cancelled",
    checkedInAt: null,
    ticketUrl: "https://www.tokepass.com.ar/tickets/tkt-009",
  },
  {
    id: "tkt-010",
    code: "TK-85590",
    holderName: "Tomás Ibarra",
    holderEmail: "tomas.ibarra@gmail.com",
    holderDni: "36771440",
    sectorLabel: "Sector Verde · Fila 1 · Mesa 2",
    status: "available",
    checkedInAt: null,
    ticketUrl: "https://www.tokepass.com.ar/tickets/tkt-010",
  },
  {
    id: "tkt-011",
    code: "TK-85661",
    holderName: "Florencia Acosta",
    holderEmail: "flor.acosta@outlook.com",
    holderDni: "40122876",
    sectorLabel: "Campo General",
    status: "available",
    checkedInAt: null,
    ticketUrl: "https://www.tokepass.com.ar/tickets/tkt-011",
  },
  {
    id: "tkt-012",
    code: "TK-85704",
    holderName: "Bruno Salinas",
    holderEmail: "bruno.salinas@gmail.com",
    holderDni: "29115670",
    sectorLabel: "Palco Plata · Mesa 4",
    status: "checked_in",
    checkedInAt: "2026-08-12T23:11:00.000-03:00",
    ticketUrl: "https://www.tokepass.com.ar/tickets/tkt-012",
  },
]

/** Totales de ejemplo para las métricas superiores (independientes del mock filtrable). */
export const MOCK_ISSUED_TICKET_METRICS = {
  totalIssued: 4520,
  checkedIn: 1200,
  pending: 3320,
} as const

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
  ]
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
