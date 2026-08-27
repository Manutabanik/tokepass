import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  applyDraftDayPriceStock,
  createDraftLineItemsForScheduleDays,
  draftDayPriceStockRows,
  draftTicketNameWithoutDay,
  generalTicketNeedsDayPricing,
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

  it("creates one unbound ticket on a single day and one per jornada on multi-day", () => {
    const single = createDraftLineItemsForScheduleDays([friday])
    assert.equal(single.length, 1)
    assert.deepEqual(single[0]?.validDayIds, [])
    const multi = createDraftLineItemsForScheduleDays([friday, saturday])
    assert.equal(multi.length, 2)
    assert.deepEqual(
      multi.map((ticket) => ticket.validDayIds),
      [[friday.id], [saturday.id]],
    )
    assert.match(multi[0]?.name ?? "", /Viernes/i)
    assert.match(multi[1]?.name ?? "", /Sábado/i)
  })

  it("asks for per-day pricing only when a general covers more than one jornada", () => {
    assert.equal(
      generalTicketNeedsDayPricing(
        { source: "general", validDayIds: [friday.id, saturday.id], sectorId: "" },
        2,
      ),
      true,
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
})
