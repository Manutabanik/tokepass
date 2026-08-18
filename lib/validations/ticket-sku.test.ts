import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { ticketTierSchema } from "@/lib/validations/event-form"
import {
  TicketSkuCreateSchema,
  resolveTicketSectorId,
} from "@/lib/validations/ticket-sku"

const publishTicket = {
  name: "VIP Flotante",
  price: 15000,
  capacity: 80,
  visibility: "public" as const,
  layoutType: "general" as const,
  capacityPerUnit: 1,
  admitCount: 1,
}

describe("TicketSkuCreateSchema", () => {
  it("acepta sector_id null y usa max_capacity propio", () => {
    const parsed = TicketSkuCreateSchema.parse({
      name: "General",
      max_capacity: 200,
      sector_id: null,
    })
    assert.equal(parsed.capacity, 200)
    assert.equal(parsed.seatingSectorId, null)
  })

  it("acepta sector_id undefined y seating_sector_id vacío", () => {
    const omitted = TicketSkuCreateSchema.parse({
      name: "Campo",
      capacity: 50,
    })
    assert.equal(omitted.seatingSectorId ?? null, null)

    const empty = TicketSkuCreateSchema.parse({
      name: "Campo",
      capacity: 50,
      seating_sector_id: "",
      sector_id: undefined,
    })
    assert.equal(empty.seatingSectorId ?? null, null)
  })

  it("prioriza seatingSectorId y copia el alias sector_id", () => {
    const parsed = TicketSkuCreateSchema.parse({
      name: "Pista",
      capacity: 100,
      seatingSectorId: "  general:pista  ",
      sector_id: "ignorado",
    })
    assert.equal(parsed.seatingSectorId, "general:pista")
  })
})

describe("ticketTierSchema", () => {
  it("publicar una entrada flotante con sector_id null es válido", () => {
    const parsed = ticketTierSchema.parse({
      ...publishTicket,
      sector_id: null,
    })
    assert.equal(parsed.seatingSectorId, null)
  })

  it("publicar sin sector_id ni seatingSectorId es válido", () => {
    const parsed = ticketTierSchema.parse(publishTicket)
    assert.equal(parsed.seatingSectorId ?? null, null)
  })
})

describe("resolveTicketSectorId", () => {
  it("trata el sentinela del dropdown como flotante", () => {
    assert.equal(
      resolveTicketSectorId({ seatingSectorId: "__none__" }),
      null,
    )
  })
})
