import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  reconcileTicketTierIds,
  sanitizeTicketTiersForPersist,
} from "@/lib/events/sanitize-ticket-tiers"
import type { EventFormValues } from "@/lib/validations/event-form"

function ticket(
  patch: Partial<EventFormValues["tickets"][number]>,
): EventFormValues["tickets"][number] {
  return {
    name: "General",
    price: 1000,
    capacity: 10,
    timeLimit: "",
    bonusReward: "",
    dayId: null,
    visibility: "public",
    layoutType: "general",
    seatingSectorId: null,
    capacityPerUnit: 1,
    admitCount: 1,
    tierType: "general",
    listPrice: null,
    bundleItems: [],
    description: "",
    highlightBadge: null,
    phases: [],
    ...patch,
  }
}

describe("sanitizeTicketTiersForPersist", () => {
  it("en create elimina cualquier id de cliente", () => {
    const next = sanitizeTicketTiersForPersist(
      [ticket({ id: "11111111-1111-4111-8111-111111111111" })],
      { mode: "create" },
    )
    assert.equal(next[0]?.id, undefined)
    assert.equal(next[0]?.isNew, undefined)
  })

  it("en update respeta ids persistidos y limpia isNew / ids ajenos", () => {
    const persisted = "22222222-2222-4222-8222-222222222222"
    const ghost = "33333333-3333-4333-8333-333333333333"
    const next = sanitizeTicketTiersForPersist(
      [
        ticket({ id: persisted, name: "VIP" }),
        ticket({ id: ghost, name: "Fantasma" }),
        ticket({ isNew: true, id: "44444444-4444-4444-8444-444444444444", name: "Nueva" }),
      ],
      { mode: "update", persistedIds: [persisted] },
    )
    assert.equal(next[0]?.id, persisted)
    assert.equal(next[1]?.id, undefined)
    assert.equal(next[2]?.id, undefined)
  })
})

describe("reconcileTicketTierIds", () => {
  it("borra id si no existe en la DB del evento", () => {
    const live = "55555555-5555-4555-8555-555555555555"
    const next = reconcileTicketTierIds(
      [
        ticket({ id: live, name: "Viva" }),
        ticket({ id: "66666666-6666-4666-8666-666666666666", name: "Zombie" }),
        ticket({ name: "Sin id" }),
      ],
      [live],
    )
    assert.equal(next[0]?.id, live)
    assert.equal(next[1]?.id, undefined)
    assert.equal(next[2]?.id, undefined)
  })
})
