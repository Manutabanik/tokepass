import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  applyDraftDayPriceStock,
  collapseDayPricedTicketsForEditor,
  createDraftLineItemsForScheduleDays,
  draftDayPriceStockRows,
  draftTicketNameWithoutDay,
  expandDayPricedTicketsForPersist,
  generalTicketNeedsDayPricing,
  nextDraftTicketAfterScheduleChange,
} from "@/lib/events/draft-day-priced-tickets"
import {
  createDraftLineItem,
  emptyEventDraftV2LineItem,
} from "@/lib/validations/event-draft-v2"

const friday = {
  id: "day-viernes",
  name: "Viernes",
  date: "2026-11-13",
  startDate: "2026-11-13T18:00",
  endDate: "2026-11-13T23:00",
  slots: [],
}
const saturday = {
  id: "day-sabado",
  name: "Sábado",
  date: "2026-11-14",
  startDate: "2026-11-14T18:00",
  endDate: "2026-11-14T23:00",
  slots: [],
}

describe("draft-day-priced-tickets", () => {
  it("strips the weekday suffix so Friday and Saturday share a family name", () => {
    assert.equal(
      draftTicketNameWithoutDay("Entrada General Viernes", [friday, saturday]),
      "Entrada General",
    )
  })

  it("reads Saturday price from the existing daily ticket instead of copying Friday", () => {
    const fridayTicket = {
      ...emptyEventDraftV2LineItem("t-vie"),
      name: "Entrada General Viernes",
      price: 20000,
      stock: 10000,
      validDayIds: [friday.id, saturday.id],
    }
    const saturdayTicket = {
      ...emptyEventDraftV2LineItem("t-sab"),
      name: "General Sabado",
      price: 30000,
      stock: 5000,
      validDayIds: [saturday.id],
    }
    const rows = draftDayPriceStockRows(
      fridayTicket,
      [fridayTicket, saturdayTicket],
      0,
      [friday, saturday],
    )
    assert.deepEqual(
      rows.map((row) => [row.dayId, row.price, row.stock]),
      [
        [friday.id, 20000, 10000],
        [saturday.id, 30000, 5000],
      ],
    )
  })

  it("splits an abono into one general ticket per day with its own price and stock", () => {
    const abono = {
      ...emptyEventDraftV2LineItem("t-abono"),
      name: "General",
      price: 20000,
      stock: 10000,
      validDayIds: [friday.id, saturday.id],
    }
    const next = applyDraftDayPriceStock([abono], 0, [friday, saturday], [
      { dayId: friday.id, label: "Viernes", price: 20000, stock: 10000 },
      { dayId: saturday.id, label: "Sábado", price: 30000, stock: 5000 },
    ])
    assert.equal(next.length, 2)
    assert.deepEqual(
      next.map((ticket) => [
        ticket.validDayIds,
        ticket.slotId,
        ticket.price,
        ticket.stock,
      ]),
      [
        [[friday.id], friday.id, 20000, 10000],
        [[saturday.id], saturday.id, 30000, 5000],
      ],
    )
    assert.equal(next[0]?.id, "t-abono")
    assert.notEqual(next[1]?.id, "t-abono")
  })

  it("updates the existing Saturday ticket instead of creating a third general", () => {
    const fridayTicket = {
      ...emptyEventDraftV2LineItem("t-vie"),
      name: "Entrada General Viernes",
      price: 20000,
      stock: 10000,
      validDayIds: [friday.id, saturday.id],
    }
    const saturdayTicket = {
      ...emptyEventDraftV2LineItem("t-sab"),
      name: "General Sabado",
      price: 30000,
      stock: 5000,
      validDayIds: [saturday.id],
    }
    const next = applyDraftDayPriceStock(
      [fridayTicket, saturdayTicket],
      0,
      [friday, saturday],
      [
        { dayId: friday.id, label: "Viernes", price: 22000, stock: 8000 },
        { dayId: saturday.id, label: "Sábado", price: 35000, stock: 4000 },
      ],
    )
    assert.equal(next.length, 2)
    assert.deepEqual(next[0]?.validDayIds, [friday.id])
    assert.equal(next[0]?.price, 22000)
    assert.equal(next[1]?.id, "t-sab")
    assert.equal(next[1]?.name, "General Sabado")
    assert.equal(next[1]?.price, 35000)
    assert.equal(next[1]?.stock, 4000)
  })

  it("creates one visual general on multi-day with a rate row per jornada", () => {
    const single = createDraftLineItemsForScheduleDays([friday])
    assert.equal(single.length, 1)
    assert.deepEqual(single[0]?.validDayIds, [])
    const multi = createDraftLineItemsForScheduleDays([friday, saturday])
    assert.equal(multi.length, 1)
    assert.deepEqual(multi[0]?.validDayIds, [])
    assert.equal(multi[0]?.name, "General")
    assert.deepEqual(
      multi[0]?.dayRates.map((rate) => rate.dayId),
      [friday.id, saturday.id],
    )
    const extra = createDraftLineItemsForScheduleDays(
      [friday, saturday],
      "extra",
    )
    assert.equal(extra.length, 1)
    assert.equal(extra[0]?.ticketType, "extra")
    assert.equal(extra[0]?.name, "")
    assert.deepEqual(
      extra[0]?.dayRates.map((rate) => rate.dayId),
      [friday.id, saturday.id],
    )
  })

  it("fills dayRates when the schedule grows and the drawer never opened", () => {
    const ticket = {
      ...createDraftLineItem(),
      name: "General",
      price: 15000,
      stock: 40,
      dayRates: [],
    }
    const synced = nextDraftTicketAfterScheduleChange(ticket, [friday, saturday])
    assert.ok(synced)
    assert.deepEqual(
      synced.dayRates.map((rate) => rate.dayId),
      [friday.id, saturday.id],
    )
    assert.equal(synced.price, 15000)
    assert.equal(synced.stock, 80)
  })

  it("clears leftover dayRates when the event goes back to one day", () => {
    const ticket = {
      ...createDraftLineItem(),
      dayRates: [
        { dayId: friday.id, price: 10, stock: 5, ticketId: "" },
        { dayId: saturday.id, price: 12, stock: 5, ticketId: "" },
      ],
    }
    const synced = nextDraftTicketAfterScheduleChange(ticket, [friday])
    assert.ok(synced)
    assert.deepEqual(synced.dayRates, [])
  })

  it("does not rewrite map tickets or already-synced dayRates", () => {
    const mapTicket = {
      ...createDraftLineItem(),
      source: "map" as const,
      sectorId: "mesa-1",
    }
    assert.equal(
      nextDraftTicketAfterScheduleChange(mapTicket, [friday, saturday]),
      null,
    )
    const ready = nextDraftTicketAfterScheduleChange(
      createDraftLineItem(),
      [friday, saturday],
    )
    assert.ok(ready)
    assert.equal(
      nextDraftTicketAfterScheduleChange(ready, [friday, saturday]),
      null,
    )
  })

  it("asks for per-day pricing only on unbound generals of a multi-day event", () => {
    assert.equal(
      generalTicketNeedsDayPricing(
        { source: "general", validDayIds: [], sectorId: "" },
        2,
      ),
      true,
    )
    assert.equal(
      generalTicketNeedsDayPricing(
        { source: "general", validDayIds: [friday.id, saturday.id], sectorId: "" },
        2,
      ),
      false,
    )
    assert.equal(
      generalTicketNeedsDayPricing(
        { source: "general", validDayIds: [friday.id], sectorId: "" },
        2,
      ),
      false,
    )
    assert.equal(
      generalTicketNeedsDayPricing(
        createDraftLineItem(),
        1,
      ),
      false,
    )
  })

  it("collapses sibling daily tickets into one editor card and expands them back", () => {
    const fridayTicket = {
      ...emptyEventDraftV2LineItem("t-vie"),
      name: "General Viernes",
      price: 20000,
      stock: 10000,
      validDayIds: [friday.id],
      slotId: friday.id,
    }
    const saturdayTicket = {
      ...emptyEventDraftV2LineItem("t-sab"),
      name: "General Sábado",
      price: 30000,
      stock: 5000,
      validDayIds: [saturday.id],
      slotId: saturday.id,
    }
    const visual = collapseDayPricedTicketsForEditor(
      [fridayTicket, saturdayTicket],
      [friday, saturday],
    )
    assert.equal(visual.length, 1)
    assert.equal(visual[0]?.name, "General")
    assert.deepEqual(visual[0]?.validDayIds, [])
    assert.deepEqual(
      visual[0]?.dayRates.map((rate) => [
        rate.dayId,
        rate.price,
        rate.stock,
        rate.ticketId,
      ]),
      [
        [friday.id, 20000, 10000, "t-vie"],
        [saturday.id, 30000, 5000, "t-sab"],
      ],
    )

    const persist = expandDayPricedTicketsForPersist(visual, [friday, saturday])
    assert.equal(persist.length, 2)
    assert.equal(persist[0]?.id, "t-vie")
    assert.equal(persist[1]?.id, "t-sab")
    assert.equal(persist[0]?.price, 20000)
    assert.equal(persist[1]?.price, 30000)
    assert.deepEqual(persist[0]?.validDayIds, [friday.id])
    assert.deepEqual(persist[1]?.validDayIds, [saturday.id])
  })

  it("does not expand an abono into daily tickets", () => {
    const abono = {
      ...emptyEventDraftV2LineItem("t-abono"),
      name: "Abono",
      price: 45000,
      stock: 200,
      validDayIds: [friday.id, saturday.id],
    }
    const persist = expandDayPricedTicketsForPersist([abono], [friday, saturday])
    assert.equal(persist.length, 1)
    assert.equal(persist[0]?.id, "t-abono")
    assert.deepEqual(persist[0]?.validDayIds, [friday.id, saturday.id])
  })
})
