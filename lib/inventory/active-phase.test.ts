import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  applyActivePhaseToTier,
  applyPhaseRolloverToPhases,
  decidePhaseCart,
  isPhaseStockError,
  phaseRemaining,
  resolveSalePhases,
  type PublicTicketPhase,
} from "@/lib/inventory/active-phase"

function phase(
  patch: Partial<PublicTicketPhase> & Pick<PublicTicketPhase, "id" | "name">,
): PublicTicketPhase {
  return {
    price: 10000,
    capacityLimit: 100,
    sold: 0,
    startTime: null,
    endTime: null,
    status: "scheduled",
    ...patch,
  }
}

const now = Date.parse("2026-08-14T20:00:00.000Z")

describe("active-phase", () => {
  it("rota una fase active vencida y activa la siguiente en ventana", () => {
    const resolved = resolveSalePhases(
      [
        phase({
          id: "early",
          name: "Early Bird",
          status: "active",
          price: 8000,
          endTime: "2026-08-14T19:00:00.000Z",
        }),
        phase({
          id: "p1",
          name: "Preventa 1",
          status: "scheduled",
          price: 12000,
          startTime: "2026-08-14T19:00:00.000Z",
        }),
      ],
      now,
    )
    assert.equal(resolved.current?.id, "p1")
    assert.equal(resolved.current?.price, 12000)
    assert.equal(resolved.displayActive?.id, "p1")
  })

  it("elige la primera fase active con cupo", () => {
    const resolved = resolveSalePhases(
      [
        phase({ id: "p1", name: "Preventa 1", status: "active", sold: 40, capacityLimit: 100, price: 10000 }),
        phase({ id: "p2", name: "Preventa 2", status: "scheduled", price: 15000 }),
      ],
      now,
    )
    assert.equal(resolved.displayActive?.id, "p1")
    assert.equal(resolved.current?.price, 10000)
    assert.equal(resolved.upcoming[0]?.id, "p2")
  })

  it("ignora la fase active si ya superó su cupo", () => {
    const resolved = resolveSalePhases(
      [
        phase({ id: "p1", name: "Preventa 1", status: "active", sold: 100, capacityLimit: 100 }),
        phase({ id: "p2", name: "Preventa 2", status: "scheduled", price: 15000 }),
      ],
      now,
    )
    assert.equal(resolved.displayActive?.id, "p2")
    assert.equal(resolved.sellable?.id, "p2")
    assert.equal(resolved.current?.price, 15000)
  })

  it("aplica precio y stock del lote activo al tier", () => {
    const applied = applyActivePhaseToTier(
      { price: 20000, available: 500 },
      [
        phase({
          id: "p1",
          name: "Preventa 1",
          status: "active",
          price: 10000,
          sold: 90,
          capacityLimit: 100,
        }),
      ],
      now,
    )
    assert.equal(applied.price, 10000)
    assert.equal(applied.available, 10)
  })

  it("pide rollover al siguiente lote si el cupo actual no alcanza", () => {
    const decision = decidePhaseCart(
      [
        phase({ id: "p1", name: "Preventa 1", status: "active", sold: 99, capacityLimit: 100, price: 10000 }),
        phase({ id: "p2", name: "Preventa 2", status: "scheduled", price: 15000, capacityLimit: 200 }),
      ],
      3,
      now,
    )
    assert.equal(decision.kind, "next")
    if (decision.kind === "next") {
      assert.equal(decision.phase.id, "p2")
      assert.equal(decision.from?.id, "p1")
    }
  })

  it("ajusta la cantidad si no hay lote siguiente", () => {
    const decision = decidePhaseCart(
      [phase({ id: "p1", name: "Preventa 1", status: "active", sold: 99, capacityLimit: 100 })],
      3,
      now,
    )
    assert.equal(decision.kind, "clamp")
    if (decision.kind === "clamp") {
      assert.equal(decision.remaining, 1)
    }
  })

  it("marca el lote siguiente como active al aplicar rollover", () => {
    const next = applyPhaseRolloverToPhases(
      [
        phase({ id: "p1", name: "Preventa 1", status: "active", capacityLimit: 100, sold: 99 }),
        phase({ id: "p2", name: "Preventa 2", status: "scheduled" }),
      ],
      "p2",
    )
    assert.equal(next[0]?.status, "sold_out")
    assert.equal(next[1]?.status, "active")
  })

  it("detecta errores de fase del RPC", () => {
    assert.equal(
      isPhaseStockError("Capacidad de la fase de venta insuficiente"),
      true,
    )
    assert.equal(phaseRemaining(phase({ id: "p", name: "Lote", capacityLimit: null })), Number.POSITIVE_INFINITY)
  })
})
