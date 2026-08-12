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

function party(
  name: string,
  email: string,
  dni: string,
): CustodyParty {
  return { name, email, dni }
}

const juan = party("Juan Pérez", "juan.perez@gmail.com", "30111222")
const maria = party("María Gómez", "maria.gomez@outlook.com", "38990441")
const valentina = party(
  "Valentina Rossi",
  "valen.rossi@gmail.com",
  "38451223",
)
const martin = party("Martín Alegre", "martin.alegre@outlook.com", "30112887")
const lucia = party("Lucía Fernández", "lucia.fernandez@hotmail.com", "42776110")
const joaquin = party("Joaquín Méndez", "joaco.mendez@yahoo.com", "35990441")
const camila = party("Camila Soto", "cami.soto@gmail.com", "41200358")
const diego = party("Diego Palacios", "diego.palacios@tokepass.test", "27884512")
const sofia = party("Sofía Navarro", "sofia.navarro@icloud.com", "39881204")
const nicolas = party("Nicolás Ruiz", "nico.ruiz@gmail.com", "33501998")
const agustina = party("Agustina Paredes", "agus.paredes@proton.me", "44110233")
const tomas = party("Tomás Ibarra", "tomas.ibarra@gmail.com", "36771440")
const flor = party("Florencia Acosta", "flor.acosta@outlook.com", "40122876")
const bruno = party("Bruno Salinas", "bruno.salinas@gmail.com", "29115670")
const carla = party("Carla Benítez", "carla.benitez@gmail.com", "37665110")

const juanToMaria: CustodyTransferEvent = {
  at: "2026-08-10T18:42:00.000-03:00",
  channel: "resale",
  from: juan,
  to: maria,
  fromTicketCode: "TK-84920",
  toTicketCode: "TK-91023",
  fromTicketId: "tkt-001",
  toTicketId: "tkt-013",
}

const diegoToCarla: CustodyTransferEvent = {
  at: "2026-08-11T14:05:00.000-03:00",
  channel: "tokepass_transfer",
  from: diego,
  to: carla,
  fromTicketCode: "TK-85201",
  toTicketCode: "TK-91088",
  fromTicketId: "tkt-006",
  toTicketId: "tkt-014",
}

/** Mock completo para probar buscador, filtros, transferencias y custodia. */
export const MOCK_ISSUED_TICKETS: IssuedTicketRow[] = [
  {
    id: "tkt-001",
    code: "TK-84920",
    holderName: juan.name,
    holderEmail: juan.email,
    holderDni: juan.dni,
    sectorLabel: "Sector Naranja · Fila 2 · Mesa 5",
    status: "transferred",
    checkedInAt: null,
    purchasedAt: "2026-07-20T11:10:00.000-03:00",
    ticketUrl: "https://www.tokepass.com.ar/tickets/tkt-001",
    originalBuyer: juan,
    transferredTo: {
      name: maria.name,
      code: "TK-91023",
      ticketId: "tkt-013",
    },
    receivedFrom: null,
    custodyChain: [juanToMaria],
  },
  {
    id: "tkt-013",
    code: "TK-91023",
    holderName: maria.name,
    holderEmail: maria.email,
    holderDni: maria.dni,
    sectorLabel: "Sector Naranja · Fila 2 · Mesa 5",
    status: "available",
    checkedInAt: null,
    purchasedAt: "2026-07-20T11:10:00.000-03:00",
    ticketUrl: "https://www.tokepass.com.ar/tickets/tkt-013",
    originalBuyer: juan,
    transferredTo: null,
    receivedFrom: {
      name: juan.name,
      code: "TK-84920",
      ticketId: "tkt-001",
    },
    custodyChain: [juanToMaria],
  },
  {
    id: "tkt-002",
    code: "TK-84921",
    holderName: martin.name,
    holderEmail: martin.email,
    holderDni: martin.dni,
    sectorLabel: "Campo General",
    status: "checked_in",
    checkedInAt: "2026-08-12T21:15:00.000-03:00",
    purchasedAt: "2026-07-22T09:30:00.000-03:00",
    ticketUrl: "https://www.tokepass.com.ar/tickets/tkt-002",
    originalBuyer: martin,
    transferredTo: null,
    receivedFrom: null,
    custodyChain: [],
  },
  {
    id: "tkt-003",
    code: "TK-85002",
    holderName: lucia.name,
    holderEmail: lucia.email,
    holderDni: lucia.dni,
    sectorLabel: "VIP Platea · Fila 1 · Butaca 12",
    status: "available",
    checkedInAt: null,
    purchasedAt: "2026-07-25T16:00:00.000-03:00",
    ticketUrl: "https://www.tokepass.com.ar/tickets/tkt-003",
    originalBuyer: lucia,
    transferredTo: null,
    receivedFrom: null,
    custodyChain: [],
  },
  {
    id: "tkt-004",
    code: "TK-85018",
    holderName: joaquin.name,
    holderEmail: joaquin.email,
    holderDni: joaquin.dni,
    sectorLabel: "Sector Azul · Fila 8 · Mesa 3",
    status: "cancelled",
    checkedInAt: null,
    purchasedAt: "2026-07-18T12:00:00.000-03:00",
    ticketUrl: "https://www.tokepass.com.ar/tickets/tkt-004",
    originalBuyer: joaquin,
    transferredTo: null,
    receivedFrom: null,
    custodyChain: [],
  },
  {
    id: "tkt-005",
    code: "TK-85144",
    holderName: camila.name,
    holderEmail: camila.email,
    holderDni: camila.dni,
    sectorLabel: "Campo General",
    status: "checked_in",
    checkedInAt: "2026-08-12T22:03:00.000-03:00",
    purchasedAt: "2026-07-28T20:15:00.000-03:00",
    ticketUrl: "https://www.tokepass.com.ar/tickets/tkt-005",
    originalBuyer: camila,
    transferredTo: null,
    receivedFrom: null,
    custodyChain: [],
  },
  {
    id: "tkt-006",
    code: "TK-85201",
    holderName: diego.name,
    holderEmail: diego.email,
    holderDni: diego.dni,
    sectorLabel: "Palco Oro · Mesa 1",
    status: "transferred",
    checkedInAt: null,
    purchasedAt: "2026-07-15T10:00:00.000-03:00",
    ticketUrl: "https://www.tokepass.com.ar/tickets/tkt-006",
    originalBuyer: diego,
    transferredTo: {
      name: carla.name,
      code: "TK-91088",
      ticketId: "tkt-014",
    },
    receivedFrom: null,
    custodyChain: [diegoToCarla],
  },
  {
    id: "tkt-014",
    code: "TK-91088",
    holderName: carla.name,
    holderEmail: carla.email,
    holderDni: carla.dni,
    sectorLabel: "Palco Oro · Mesa 1",
    status: "available",
    checkedInAt: null,
    purchasedAt: "2026-07-15T10:00:00.000-03:00",
    ticketUrl: "https://www.tokepass.com.ar/tickets/tkt-014",
    originalBuyer: diego,
    transferredTo: null,
    receivedFrom: {
      name: diego.name,
      code: "TK-85201",
      ticketId: "tkt-006",
    },
    custodyChain: [diegoToCarla],
  },
  {
    id: "tkt-007",
    code: "TK-85277",
    holderName: sofia.name,
    holderEmail: sofia.email,
    holderDni: sofia.dni,
    sectorLabel: "Sector Naranja · Fila 4 · Mesa 9",
    status: "available",
    checkedInAt: null,
    purchasedAt: "2026-08-01T13:40:00.000-03:00",
    ticketUrl: "https://www.tokepass.com.ar/tickets/tkt-007",
    originalBuyer: sofia,
    transferredTo: null,
    receivedFrom: null,
    custodyChain: [],
  },
  {
    id: "tkt-008",
    code: "TK-85330",
    holderName: nicolas.name,
    holderEmail: nicolas.email,
    holderDni: nicolas.dni,
    sectorLabel: "Campo General",
    status: "checked_in",
    checkedInAt: "2026-08-12T20:47:00.000-03:00",
    purchasedAt: "2026-07-30T08:20:00.000-03:00",
    ticketUrl: "https://www.tokepass.com.ar/tickets/tkt-008",
    originalBuyer: nicolas,
    transferredTo: null,
    receivedFrom: null,
    custodyChain: [],
  },
  {
    id: "tkt-009",
    code: "TK-85412",
    holderName: agustina.name,
    holderEmail: agustina.email,
    holderDni: agustina.dni,
    sectorLabel: "VIP Platea · Fila 3 · Butaca 7",
    status: "cancelled",
    checkedInAt: null,
    purchasedAt: "2026-07-12T19:00:00.000-03:00",
    ticketUrl: "https://www.tokepass.com.ar/tickets/tkt-009",
    originalBuyer: agustina,
    transferredTo: null,
    receivedFrom: null,
    custodyChain: [],
  },
  {
    id: "tkt-010",
    code: "TK-85590",
    holderName: tomas.name,
    holderEmail: tomas.email,
    holderDni: tomas.dni,
    sectorLabel: "Sector Verde · Fila 1 · Mesa 2",
    status: "available",
    checkedInAt: null,
    purchasedAt: "2026-08-03T17:25:00.000-03:00",
    ticketUrl: "https://www.tokepass.com.ar/tickets/tkt-010",
    originalBuyer: tomas,
    transferredTo: null,
    receivedFrom: null,
    custodyChain: [],
  },
  {
    id: "tkt-011",
    code: "TK-85661",
    holderName: flor.name,
    holderEmail: flor.email,
    holderDni: flor.dni,
    sectorLabel: "Campo General",
    status: "available",
    checkedInAt: null,
    purchasedAt: "2026-08-05T21:10:00.000-03:00",
    ticketUrl: "https://www.tokepass.com.ar/tickets/tkt-011",
    originalBuyer: flor,
    transferredTo: null,
    receivedFrom: null,
    custodyChain: [],
  },
  {
    id: "tkt-012",
    code: "TK-85704",
    holderName: bruno.name,
    holderEmail: bruno.email,
    holderDni: bruno.dni,
    sectorLabel: "Palco Plata · Mesa 4",
    status: "checked_in",
    checkedInAt: "2026-08-12T23:11:00.000-03:00",
    purchasedAt: "2026-07-09T15:45:00.000-03:00",
    ticketUrl: "https://www.tokepass.com.ar/tickets/tkt-012",
    originalBuyer: bruno,
    transferredTo: null,
    receivedFrom: null,
    custodyChain: [],
  },
  {
    id: "tkt-015",
    code: "TK-85800",
    holderName: valentina.name,
    holderEmail: valentina.email,
    holderDni: valentina.dni,
    sectorLabel: "Campo General",
    status: "available",
    checkedInAt: null,
    purchasedAt: "2026-08-08T12:00:00.000-03:00",
    ticketUrl: "https://www.tokepass.com.ar/tickets/tkt-015",
    originalBuyer: valentina,
    transferredTo: null,
    receivedFrom: null,
    custodyChain: [],
  },
]

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

export function nextMockTicketCode(existing: IssuedTicketRow[]): string {
  const nums = existing.map((ticket) => {
    const match = ticket.code.match(/(\d+)/)
    return match ? Number(match[1]) : 0
  })
  const next = Math.max(91000, ...nums) + 1
  return `TK-${next}`
}
