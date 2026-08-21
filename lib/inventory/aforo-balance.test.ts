import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  assignRemainingToGeneral,
  computeAforoBalance,
  findPrimaryGeneralIndex,
  scaleTicketStockToLimit,
  ticketDisplayBadge,
} from "@/lib/inventory/aforo-balance"
import type { EventFormValues } from "@/lib/validations/event-form"

function ticket(
  patch: Partial<EventFormValues["tickets"][number]> & {
    tierType: EventFormValues["tickets"][number]["tierType"]
    capacity: number
  },
): EventFormValues["tickets"][number] {
  return {
    name: patch.name ?? "Entrada",
    price: patch.price ?? 1000,
    basePrice: patch.basePrice ?? patch.price ?? 1000,
    feeStrategy: patch.feeStrategy ?? "absorb_in_price",
    calculationMode: patch.calculationMode ?? "public_price",
    capacity: patch.capacity,
    timeLimit: "",
    bonusReward: "",
    dayId: null,
    visibility: "public",
    layoutType: "general",
    seatingSectorId: null,
    capacityPerUnit: 1,
    minPurchaseLimit: 1,
    maxPurchaseLimit: null,
    admitCount: 1,
    tierType: patch.tierType,
    listPrice: null,
    bundleItems: [],
    bundleType: null,
    promoDiscountType: null,
    promoDiscountValue: 0,
    promoRequiredQty: 1,
    promoPayQty: 1,
    description: "",
    highlightBadge: null,
    phases: [],
    ...patch,
  }
}

describe("aforo balance", () => {
  it("calcula lugares de mapa sin asignar a entradas", () => {
    const general = ticket({
      name: "Entrada General",
      tierType: "general",
      capacity: 40,
    })
    const balance = computeAforoBalance({
      tickets: [general],
      venueMap: {
        version: 1,
        elements: [
          {
            type: "standing_zone",
            category: "commercial",
            capacity: 100,
            seats: [],
            sellMode: "group",
          },
        ],
      },
    })
    assert.equal(balance.physicalCapacity, 100)
    assert.equal(balance.ticketStock, 40)
    assert.equal(balance.difference, 60)
  })

  it("detecta sobreasignacion contra el recinto", () => {
    const general = ticket({
      name: "General",
      tierType: "general",
      capacity: 180,
    })
    const vip = ticket({
      name: "VIP",
      tierType: "general",
      capacity: 40,
    })
    const balance = computeAforoBalance({
      tickets: [general, vip],
      venueCapacity: 200,
    })
    assert.equal(balance.physicalCapacity, 200)
    assert.equal(balance.ticketStock, 220)
    assert.equal(balance.difference, -20)
  })

  it("asigna el resto a la entrada general principal", () => {
    const vip = ticket({ name: "VIP", tierType: "general", capacity: 20 })
    const general = ticket({
      name: "Entrada General",
      tierType: "general",
      capacity: 40,
    })
    const next = assignRemainingToGeneral([vip, general], 60)
    assert.equal(next[0].capacity, 20)
    assert.equal(next[1].capacity, 100)
    assert.equal(findPrimaryGeneralIndex([vip, general]), 1)
  })

  it("ajusta stock proporcionalmente al limite del mapa", () => {
    const general = ticket({
      name: "General",
      tierType: "general",
      capacity: 80,
    })
    const vip = ticket({ name: "VIP", tierType: "general", capacity: 20 })
    const extra = ticket({
      name: "Estacionamiento",
      tierType: "addon",
      capacity: 50,
    })
    const next = scaleTicketStockToLimit([general, vip, extra], 50)
    assert.equal(next[0].capacity, 40)
    assert.equal(next[1].capacity, 10)
    assert.equal(next[2].capacity, 50)
  })

  it("elige badge de categoria segun nombre y tipo", () => {
    assert.equal(
      ticketDisplayBadge({ name: "Campo VIP", price: 12000, tierType: "general" })
        .label,
      "VIP",
    )
    assert.equal(
      ticketDisplayBadge({
        name: "Jubilados",
        price: 4000,
        tierType: "general",
      }).label,
      "Jubilados",
    )
    assert.equal(
      ticketDisplayBadge({
        name: "Pack 4x3",
        price: 30000,
        tierType: "bundle",
      }).label,
      "Combo",
    )
    assert.equal(
      ticketDisplayBadge({ name: "Cortesía", price: 0, tierType: "general" })
        .label,
      "Cortesía",
    )
  })
})
