import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  isTicketOnSale,
  resolveTicketSaleState,
  saleWindowToIso,
  ticketSaleWindowError,
  ticketSaleWindowLabel,
  TICKET_SALE_ENDED_ERROR,
  TICKET_SALE_UPCOMING_ERROR,
} from "@/lib/inventory/ticket-sale-window"

const NOW = new Date("2026-08-21T20:00:00-03:00")

describe("ticket sale windows", () => {
  it("treats empty dates as immediately on sale", () => {
    const state = resolveTicketSaleState({
      capacity: 100,
      sold: 10,
      saleStartsAt: "",
      saleEndsAt: null,
      now: NOW,
    })
    assert.equal(state.kind, "active")
    assert.equal(isTicketOnSale(state), true)
  })

  it("marks upcoming lots before start_date", () => {
    const state = resolveTicketSaleState({
      capacity: 50,
      sold: 0,
      saleStartsAt: "2026-08-22T10:00",
      saleEndsAt: "2026-08-23T10:00",
      now: NOW,
    })
    assert.equal(state.kind, "upcoming")
    assert.equal(ticketSaleWindowError(state), TICKET_SALE_UPCOMING_ERROR)
    assert.match(ticketSaleWindowLabel(state) ?? "", /Disponible a partir del/)
  })

  it("marks ended lots after end_date", () => {
    const state = resolveTicketSaleState({
      capacity: 50,
      sold: 0,
      saleStartsAt: "2026-08-19T10:00",
      saleEndsAt: "2026-08-20T23:59",
      now: NOW,
    })
    assert.equal(state.kind, "ended")
    assert.equal(ticketSaleWindowError(state), TICKET_SALE_ENDED_ERROR)
    assert.equal(ticketSaleWindowLabel(state), "Preventa finalizada")
  })

  it("keeps sold out above the date window", () => {
    const state = resolveTicketSaleState({
      capacity: 10,
      sold: 10,
      saleStartsAt: "2026-08-21T10:00",
      saleEndsAt: "2026-08-22T10:00",
      now: NOW,
    })
    assert.equal(state.kind, "sold_out")
    assert.equal(ticketSaleWindowLabel(state), "Agotado")
  })

  it("serializes datetime-local to ISO for persist", () => {
    const iso = saleWindowToIso("2026-08-21T20:00")
    assert.ok(iso)
    assert.equal(new Date(iso!).getTime() > 0, true)
  })
})
