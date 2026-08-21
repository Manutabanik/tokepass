import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  getSeatDisplayName,
  getTableDisplayName,
  getVenueElementDisplayName,
} from "@/lib/map-utils"
import type { EventSeat, EventTable } from "@/types/event-map"

const seat = (extras: Partial<EventSeat> = {}): EventSeat => ({
  id: "s-1",
  seat_number: 2,
  price: 15000,
  is_available: true,
  ...extras,
})

const table = (extras: Partial<EventTable> = {}): EventTable => ({
  id: "t-1",
  table_number: 4,
  seats: [],
  ...extras,
})

describe("getSeatDisplayName", () => {
  it("usa la etiqueta personalizada de la silla tal cual", () => {
    assert.equal(
      getSeatDisplayName(
        seat({ custom_label: "Silla Preferencial VIP A" }),
        table({ custom_label: "Mesa VIP Escenario" }),
        "VIP",
      ),
      "Silla Preferencial VIP A",
    )
  })

  it("arma Sector - Mesa - Silla si no hay override", () => {
    assert.equal(
      getSeatDisplayName(seat(), table(), "VIP"),
      "Sector VIP - Mesa 4 - Silla 2",
    )
  })

  it("usa la etiqueta de mesa si la silla no tiene override", () => {
    assert.equal(
      getSeatDisplayName(
        seat(),
        table({ custom_label: "Mesa VIP Escenario" }),
        "VIP",
      ),
      "Sector VIP - Mesa VIP Escenario - Silla 2",
    )
  })
})

describe("getTableDisplayName", () => {
  it("imprime la etiqueta personalizada de la mesa", () => {
    assert.equal(
      getTableDisplayName(table({ custom_label: "Mesa VIP Escenario 1" }), "VIP"),
      "Mesa VIP Escenario 1",
    )
  })

})

describe("getVenueElementDisplayName", () => {
  it("prioriza customLabel sobre el formato de sector", () => {
    assert.equal(
      getVenueElementDisplayName({
        type: "round_table",
        label: "Mesa 4",
        sectorName: "VIP",
        customLabel: "Mesa VIP Escenario 1",
      }),
      "Mesa VIP Escenario 1",
    )
  })
})
