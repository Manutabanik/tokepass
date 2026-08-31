export type TicketSeatSource = {
  seatingLabel?: string | null
  seatingRowLabel?: string | null
  seatingLayoutType?: "table_combo" | "numbered_seat" | null
  tierName?: string | null
}

function sameSeatText(left: string, right: string): boolean {
  return left.trim().toLocaleUpperCase("es-AR") === right.trim().toLocaleUpperCase("es-AR")
}

function includesLoose(haystack: string, needle: string): boolean {
  return haystack.toLocaleLowerCase("es-AR").includes(needle.toLocaleLowerCase("es-AR"))
}

function formatRowLabel(row: string): string {
  return /^fila\b/i.test(row) ? row : `Fila ${row}`
}

/**
 * Exact map place (Mesa 01, Fila 3 - Asiento 12).
 * Ignores sector-only labels that merely repeat the ticket tier.
 */
export function ticketExactSeatLabel(ticket: TicketSeatSource): string | null {
  const place = ticket.seatingLabel?.trim() || ""
  const rowRaw = ticket.seatingRowLabel?.trim() || ""
  const tier = ticket.tierName?.trim() || ""

  if (!place && !rowRaw) return null
  if (place && !rowRaw && tier && sameSeatText(place, tier)) return null

  if (ticket.seatingLayoutType === "numbered_seat" && rowRaw && place) {
    if (includesLoose(place, rowRaw)) return place
    const seat = /\b(asiento|mesa|silla|butaca)\b/i.test(place)
      ? place
      : `Asiento ${place}`
    return `${formatRowLabel(rowRaw)} - ${seat}`
  }

  if (rowRaw && place && !includesLoose(place, rowRaw) && !sameSeatText(place, rowRaw)) {
    return `${formatRowLabel(rowRaw)} - ${place}`
  }

  return place || formatRowLabel(rowRaw)
}

export function ticketOrdinalLabel(
  tierName: string,
  index: number,
  total: number,
  seatLabel?: string | null,
): string {
  const name = tierName.trim() || "Entrada"
  const seat = seatLabel?.trim() || ""
  if (seat) return `${name} - ${seat}`
  if (total <= 1) return name
  return `${name} - Entrada ${index + 1} de ${total}`
}

export function ticketAdmissionTitle(
  ticket: TicketSeatSource & { tierName: string },
  index = 0,
  total = 1,
): string {
  return ticketOrdinalLabel(
    ticket.tierName,
    index,
    total,
    ticketExactSeatLabel(ticket),
  )
}

export function ticketOrdinalInGroup<
  T extends { id: string; tierName: string } & TicketSeatSource,
>(tickets: T[], ticket: T): { index: number; total: number; label: string } {
  const sameTier = tickets.filter((item) => item.tierName === ticket.tierName)
  const index = Math.max(0, sameTier.findIndex((item) => item.id === ticket.id))
  const total = sameTier.length
  return {
    index,
    total,
    label: ticketAdmissionTitle(ticket, index, total),
  }
}

export type WalletGroupableTicket = {
  id: string
  eventId: string
  eventTitle: string
  eventDate: string
  eventLocation?: string | null
  venueName?: string | null
  flyerUrl?: string | null
  orderId?: string | null
  orderCreatedAt?: string | null
  createdAt: string
}

export type WalletOrderBucket<T> = {
  orderKey: string
  orderId: string | null
  purchasedAt: string
  tickets: T[]
}

export type WalletEventBucket<T> = {
  eventId: string
  eventTitle: string
  eventDate: string
  eventLocation: string
  flyerUrl: string | null
  tickets: T[]
  orders: WalletOrderBucket<T>[]
}

export function walletOrderKey(ticket: {
  id: string
  orderId?: string | null
}): string {
  const orderId = ticket.orderId?.trim()
  return orderId || `ticket:${ticket.id}`
}

export function walletOrderCode(orderId: string | null | undefined): string | null {
  const raw = (orderId ?? "").replace(/-/g, "").slice(0, 8).toUpperCase()
  return raw ? `TP-${raw}` : null
}

export function walletPurchaseHeading(input: {
  purchasedAtLabel: string
  orderId?: string | null
  ticketCount: number
}): string {
  const count =
    input.ticketCount === 1 ? "1 entrada" : `${input.ticketCount} entradas`
  const code = walletOrderCode(input.orderId)
  return [`Compra del ${input.purchasedAtLabel}`, code, count]
    .filter(Boolean)
    .join(" · ")
}

function earliestTimestamp(values: Array<string | null | undefined>): string {
  return values
    .map((value) => value?.trim() || "")
    .filter(Boolean)
    .sort()[0] ?? ""
}

export function groupWalletTicketsByEventOrders<T extends WalletGroupableTicket>(
  tickets: T[],
): WalletEventBucket<T>[] {
  const events = new Map<string, WalletEventBucket<T>>()

  for (const ticket of tickets) {
    let event = events.get(ticket.eventId)
    if (!event) {
      event = {
        eventId: ticket.eventId,
        eventTitle: ticket.eventTitle,
        eventDate: ticket.eventDate,
        eventLocation: ticket.venueName ?? ticket.eventLocation ?? "Online",
        flyerUrl: ticket.flyerUrl ?? null,
        tickets: [],
        orders: [],
      }
      events.set(ticket.eventId, event)
    }
    event.tickets.push(ticket)
    if (!event.flyerUrl && ticket.flyerUrl) event.flyerUrl = ticket.flyerUrl
  }

  for (const event of events.values()) {
    const byOrder = new Map<string, T[]>()
    for (const ticket of event.tickets) {
      const key = walletOrderKey(ticket)
      const bucket = byOrder.get(key)
      if (bucket) bucket.push(ticket)
      else byOrder.set(key, [ticket])
    }

    event.orders = [...byOrder.entries()]
      .map(([orderKey, orderTickets]) => ({
        orderKey,
        orderId: orderTickets[0]?.orderId?.trim() || null,
        purchasedAt: earliestTimestamp(
          orderTickets.some((item) => item.orderCreatedAt?.trim())
            ? orderTickets.map((item) => item.orderCreatedAt)
            : orderTickets.map((item) => item.createdAt),
        ),
        tickets: orderTickets.slice().sort((left, right) => {
          const time = left.createdAt.localeCompare(right.createdAt)
          return time !== 0 ? time : left.id.localeCompare(right.id)
        }),
      }))
      .sort((left, right) => {
        const time = right.purchasedAt.localeCompare(left.purchasedAt)
        return time !== 0 ? time : left.orderKey.localeCompare(right.orderKey)
      })
  }

  return [...events.values()].sort(
    (left, right) =>
      new Date(left.eventDate).getTime() - new Date(right.eventDate).getTime(),
  )
}
