import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { resolveTicketDate } from "@/lib/event-schedule"
import { formatEventCartDateLong } from "@/lib/format"
import {
  groupWalletAccessBlocks,
  groupWalletTicketsByEventOrders,
  ticketAdmissionTitle,
  ticketExactSeatLabel,
  ticketOrdinalInGroup,
  ticketOrdinalLabel,
  walletAccessBlockExpandLabel,
  walletAccessBlockTitle,
  walletChildPlaceLabel,
  walletDayValidityChips,
  walletMetaWithoutEventTitle,
  walletQrModalTitle,
  walletOrderKey,
  walletPurchaseHeading,
  walletTicketMetaChips,
} from "@/lib/ticket-wallet"

describe("ticket wallet ordinals", () => {
  it("labels several tickets of the same tier", () => {
    assert.equal(ticketOrdinalLabel("General", 0, 4), "General - Entrada 1 de 4")
    assert.equal(ticketOrdinalLabel("General", 3, 4), "General - Entrada 4 de 4")
  })

  it("keeps a single ticket without the N de M suffix", () => {
    assert.equal(ticketOrdinalLabel("VIP", 0, 1), "VIP")
  })

  it("prefers the exact seat over the ordinal", () => {
    assert.equal(
      ticketOrdinalLabel("GRADA NARANJA", 0, 32, "Mesa 05"),
      "GRADA NARANJA - Mesa 05",
    )
  })

  it("numbers within the same tier of an event group", () => {
    const tickets = [
      { id: "a", tierName: "General" },
      { id: "b", tierName: "VIP" },
      { id: "c", tierName: "General" },
    ]
    assert.equal(
      ticketOrdinalInGroup(tickets, tickets[2]!).label,
      "General - Entrada 2 de 2",
    )
    assert.equal(ticketOrdinalInGroup(tickets, tickets[1]!).label, "VIP")
  })

  it("shows the map place instead of Entrada N de M", () => {
    const tickets = [
      {
        id: "a",
        tierName: "GRADA NARANJA",
        seatingLabel: "Mesa 01",
        seatingLayoutType: "table_combo" as const,
      },
      {
        id: "b",
        tierName: "GRADA NARANJA",
        seatingLabel: "Mesa 05",
        seatingLayoutType: "table_combo" as const,
      },
    ]
    assert.equal(
      ticketOrdinalInGroup(tickets, tickets[1]!).label,
      "GRADA NARANJA - Mesa 05",
    )
  })
})

describe("ticket exact seat label", () => {
  it("returns the table name from the map", () => {
    assert.equal(
      ticketExactSeatLabel({
        seatingLabel: "Mesa 01",
        seatingLayoutType: "table_combo",
        tierName: "GRADA NARANJA",
      }),
      "Mesa 01",
    )
  })

  it("composes row and seat for numbered places", () => {
    assert.equal(
      ticketExactSeatLabel({
        seatingLabel: "12",
        seatingRowLabel: "3",
        seatingLayoutType: "numbered_seat",
        tierName: "Platea",
      }),
      "Fila 3 - Asiento 12",
    )
  })

  it("ignores a label that only repeats the tier", () => {
    assert.equal(
      ticketExactSeatLabel({
        seatingLabel: "General",
        tierName: "General",
      }),
      null,
    )
  })

  it("builds the admission title from the seat", () => {
    assert.equal(
      ticketAdmissionTitle({
        tierName: "GRADA NARANJA",
        seatingLabel: "Mesa 05",
        seatingLayoutType: "table_combo",
      }),
      "GRADA NARANJA - Mesa 05",
    )
  })
})

describe("wallet order grouping", () => {
  const base = {
    eventId: "evt-1",
    eventTitle: "Fiesta Nacional",
    eventDate: "2026-09-12T22:00:00.000-03:00",
    eventLocation: "Predio",
    flyerUrl: null,
  }

  it("keeps two purchases of the same event in separate order buckets", () => {
    const groups = groupWalletTicketsByEventOrders([
      {
        ...base,
        id: "t1",
        orderId: "11111111-1111-4111-8111-111111111111",
        orderCreatedAt: "2026-08-01T10:00:00.000Z",
        createdAt: "2026-08-01T10:00:01.000Z",
      },
      {
        ...base,
        id: "t2",
        orderId: "11111111-1111-4111-8111-111111111111",
        orderCreatedAt: "2026-08-01T10:00:00.000Z",
        createdAt: "2026-08-01T10:00:02.000Z",
      },
      {
        ...base,
        id: "t3",
        orderId: "22222222-2222-4222-8222-222222222222",
        orderCreatedAt: "2026-08-20T18:00:00.000Z",
        createdAt: "2026-08-20T18:00:01.000Z",
      },
    ])

    assert.equal(groups.length, 1)
    assert.equal(groups[0]?.tickets.length, 3)
    assert.equal(groups[0]?.orders.length, 2)
    assert.equal(groups[0]?.orders[0]?.tickets.length, 1)
    assert.equal(groups[0]?.orders[1]?.tickets.length, 2)
    assert.equal(
      groups[0]?.orders[0]?.orderId,
      "22222222-2222-4222-8222-222222222222",
    )
  })

  it("does not merge tickets that have no order id", () => {
    assert.equal(walletOrderKey({ id: "a", orderId: null }), "ticket:a")
    const groups = groupWalletTicketsByEventOrders([
      { ...base, id: "a", orderId: null, createdAt: "2026-08-01T10:00:00.000Z" },
      { ...base, id: "b", orderId: null, createdAt: "2026-08-02T10:00:00.000Z" },
    ])
    assert.equal(groups[0]?.orders.length, 2)
  })

  it("builds the purchase heading with date, order code and count", () => {
    assert.equal(
      walletPurchaseHeading({
        purchasedAtLabel: "1 de agosto",
        orderId: "abcd1234-ffff-4000-8000-000000000001",
        ticketCount: 4,
      }),
      "Compra del 1 de agosto · TP-ABCD1234 · 4 entradas",
    )
  })
})

describe("wallet access blocks", () => {
  const base = {
    tierName: "Mesa VIP",
    maxAdmissions: 1,
    createdAt: "2026-08-01T10:00:00.000Z",
    seatingLayoutType: "table_combo" as const,
  }

  it("groups table seats from the same purchase into one parent", () => {
    const blocks = groupWalletAccessBlocks([
      {
        ...base,
        id: "a",
        orderId: "ord-1",
        seatingLabel: "Mesa 05",
        groupSlot: 1,
      },
      {
        ...base,
        id: "b",
        orderId: "ord-1",
        seatingLabel: "Mesa 05",
        groupSlot: 2,
      },
    ])
    assert.equal(blocks.length, 1)
    assert.equal(blocks[0]?.kind, "group")
    assert.equal(blocks[0]?.accessCount, 2)
    assert.equal(blocks[0]?.title, "Mesa VIP 05 (2 Accesos)")
    assert.equal(walletChildPlaceLabel(blocks[0]!.tickets[0]!, 0, 2), "Silla 1")
  })

  it("groups a 2x1 combo by order and tier", () => {
    const blocks = groupWalletAccessBlocks([
      {
        id: "a",
        orderId: "ord-1",
        tierName: "Promo 2x1",
        ticketType: "combo",
        maxAdmissions: 1,
        createdAt: "2026-08-01T10:00:00.000Z",
      },
      {
        id: "b",
        orderId: "ord-1",
        tierName: "Promo 2x1",
        ticketType: "combo",
        maxAdmissions: 1,
        createdAt: "2026-08-01T10:00:01.000Z",
      },
    ])
    assert.equal(blocks.length, 1)
    assert.equal(blocks[0]?.kind, "group")
    assert.equal(walletAccessBlockTitle(blocks[0]!.tickets), "Promo 2x1 (2 Accesos)")
  })

  it("keeps two general tickets from the same cart as singles", () => {
    const blocks = groupWalletAccessBlocks([
      {
        id: "a",
        orderId: "ord-1",
        tierName: "General",
        ticketType: "standard",
        maxAdmissions: 1,
        createdAt: "2026-08-01T10:00:00.000Z",
      },
      {
        id: "b",
        orderId: "ord-1",
        tierName: "General",
        ticketType: "standard",
        maxAdmissions: 1,
        createdAt: "2026-08-01T10:00:01.000Z",
      },
    ])
    assert.equal(blocks.length, 2)
    assert.equal(blocks.every((block) => block.kind === "single"), true)
  })

  it("uses group_id even when seats have different labels", () => {
    const blocks = groupWalletAccessBlocks([
      {
        id: "a",
        groupId: "g-1",
        tierName: "Combo",
        maxAdmissions: 1,
        createdAt: "2026-08-01T10:00:00.000Z",
        seatingLabel: "Pase A",
      },
      {
        id: "b",
        groupId: "g-1",
        tierName: "Combo",
        maxAdmissions: 1,
        createdAt: "2026-08-01T10:00:01.000Z",
        seatingLabel: "Pase B",
      },
    ])
    assert.equal(blocks.length, 1)
    assert.equal(blocks[0]?.id, "gid:g-1")
  })

  it("titles a tablón with sector, row and access count in parentheses", () => {
    assert.equal(
      walletAccessBlockTitle([
        {
          id: "a",
          tierName: "Grada Amarilla",
          maxAdmissions: 1,
          createdAt: "2026-08-01T10:00:00.000Z",
          seatingLayoutType: "table_combo",
          seatingRowLabel: "1",
          seatingLabel: "Tablón 08",
          groupSlot: 1,
        },
        {
          id: "b",
          tierName: "Grada Amarilla",
          maxAdmissions: 1,
          createdAt: "2026-08-01T10:00:01.000Z",
          seatingLayoutType: "table_combo",
          seatingRowLabel: "1",
          seatingLabel: "Tablón 08",
          groupSlot: 2,
        },
      ]),
      "Grada Amarilla Fila 1 - Tablón 08 (2 Accesos)",
    )
  })

  it("groups numbered seats from the same purchase and row", () => {
    const blocks = groupWalletAccessBlocks([
      {
        id: "a",
        orderId: "ord-1",
        tierName: "Platea",
        maxAdmissions: 1,
        createdAt: "2026-08-01T10:00:00.000Z",
        seatingLayoutType: "numbered_seat",
        seatingRowLabel: "3",
        seatingLabel: "12",
      },
      {
        id: "b",
        orderId: "ord-1",
        tierName: "Platea",
        maxAdmissions: 1,
        createdAt: "2026-08-01T10:00:01.000Z",
        seatingLayoutType: "numbered_seat",
        seatingRowLabel: "3",
        seatingLabel: "13",
      },
    ])
    assert.equal(blocks.length, 1)
    assert.equal(blocks[0]?.kind, "group")
    assert.equal(blocks[0]?.title, "Platea Fila 3 (2 Accesos)")
    assert.equal(
      walletChildPlaceLabel(blocks[0]!.tickets[0]!, 0, 2),
      "Fila 3 - Asiento 12",
    )
  })

  it("groups table chairs that share a row even if labels differ", () => {
    const blocks = groupWalletAccessBlocks([
      {
        id: "a",
        orderId: "ord-1",
        tierName: "Grada Amarilla",
        maxAdmissions: 1,
        createdAt: "2026-08-01T10:00:00.000Z",
        seatingLayoutType: "table_combo",
        seatingRowLabel: "Tablón 08",
        seatingLabel: "Silla 1",
        groupSlot: 1,
      },
      {
        id: "b",
        orderId: "ord-1",
        tierName: "Grada Amarilla",
        maxAdmissions: 1,
        createdAt: "2026-08-01T10:00:01.000Z",
        seatingLayoutType: "table_combo",
        seatingRowLabel: "Tablón 08",
        seatingLabel: "Silla 2",
        groupSlot: 2,
      },
    ])
    assert.equal(blocks.length, 1)
    assert.equal(blocks[0]?.kind, "group")
    assert.equal(blocks[0]?.title, "Grada Amarilla Tablón 08 (2 Accesos)")
    assert.equal(walletChildPlaceLabel(blocks[0]!.tickets[0]!, 0, 2), "Silla 1")
  })

  it("writes the explicit mesa expand label", () => {
    assert.equal(
      walletAccessBlockExpandLabel(8),
      "Ver los 8 lugares de esta mesa",
    )
    assert.equal(walletAccessBlockExpandLabel(8, true), "Ocultar lugares")
  })

  it("titles the QR modal with table and place", () => {
    assert.equal(
      walletQrModalTitle(
        {
          seatingLabel: "Tablón 08",
          seatingLayoutType: "table_combo",
          groupSlot: 3,
          tierName: "Grada Amarilla",
        },
        "Silla 3",
      ),
      "Tablón 08 - Lugar 3",
    )
    assert.equal(
      walletQrModalTitle(
        { tierName: "General", seatingLayoutType: null },
        "General",
      ),
      "General",
    )
  })
})

describe("wallet ticket metadata chips", () => {
  it("drops the boilerplate prefix of the day validity label", () => {
    assert.deepEqual(walletDayValidityChips("Válido solo · Día 2"), ["Día 2"])
  })

  it("keeps the leading token when it is not a boilerplate prefix", () => {
    assert.deepEqual(
      walletDayValidityChips("Abono completo · todas las jornadas"),
      ["Abono completo"],
    )
  })

  it("returns nothing for an absent day validity label", () => {
    assert.deepEqual(walletDayValidityChips(null), [])
    assert.deepEqual(walletDayValidityChips("  "), [])
  })

  it("removes the event name when the header already shows it", () => {
    assert.equal(
      walletMetaWithoutEventTitle(
        "Fiesta Nacional de la Tradición",
        "fiesta nacional de la tradicion",
      ),
      "",
    )
  })

  it("keeps the event name when the header shows a different event", () => {
    assert.equal(
      walletMetaWithoutEventTitle("Fiesta Nacional", "Cosquín Rock"),
      "Fiesta Nacional",
    )
  })

  it("builds scannable chips without repeating the header", () => {
    assert.deepEqual(
      walletTicketMetaChips({
        eventTitle: "Fiesta Nacional de la Tradición",
        dayValidityLabel: "Válido solo · Día 2",
        dateLabel: "Viernes 13 Nov",
        headingTitle: "Fiesta Nacional de la Tradición",
      }),
      ["Día 2", "Viernes 13 Nov"],
    )
  })

  it("keeps the event chip when there is no header context", () => {
    assert.deepEqual(
      walletTicketMetaChips({
        eventTitle: "Fiesta Nacional de la Tradición",
        dayValidityLabel: null,
        dateLabel: "Viernes 13 Nov",
      }),
      ["Fiesta Nacional de la Tradición", "Viernes 13 Nov"],
    )
  })

  it("dates a Día 2 ticket on Saturday instead of the event's Friday", () => {
    // Regression: the card showed "General Sábado · Día 2 · Viernes 13 Nov"
    // because the chip read events.date (día 1) instead of the ticket jornada.
    const saturdayTicket = {
      eventDate: "2026-11-14T00:00:00.000Z", // día 1, viernes 13 Nov -03
      doorsOpenAt: "2026-11-15T00:00:00.000Z", // día 2, sábado 14 Nov -03
    }
    assert.deepEqual(
      walletTicketMetaChips({
        eventTitle: "Fiesta Nacional de la Tradición",
        dayValidityLabel: "Válido solo · Día 2",
        dateLabel: formatEventCartDateLong(resolveTicketDate(saturdayTicket)),
        headingTitle: "Fiesta Nacional de la Tradición",
      }),
      ["Día 2", "Sábado 14 Nov"],
    )
  })

  it("collapses chips that repeat each other", () => {
    assert.deepEqual(
      walletTicketMetaChips({
        eventTitle: "Día 2",
        dayValidityLabel: "Válido solo · Día 2",
        dateLabel: "Viernes 13 Nov",
      }),
      ["Día 2", "Viernes 13 Nov"],
    )
  })
})
