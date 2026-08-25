import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  isMapDraftTicket,
  mergeDraftTicketsWithMap,
  ticketsFromVenueMap,
  toDraftSeatingMap,
} from "@/lib/events/draft-seating-map-v2"
import { emptyEventDraftV2LineItem } from "@/lib/validations/event-draft-v2"
import { emptyVenueMap, type InteractiveVenueMap } from "@/types/venue-map"

function plateaMap(): InteractiveVenueMap {
  return {
    ...emptyVenueMap(),
    sectors: [
      {
        id: "sector-platea",
        name: "Platea",
        color: "#f97316",
        price: 18000,
        x: 0,
        y: 0,
        rows: 1,
        seatsPerRow: 2,
        curvature: 0,
        aisle: false,
        seats: [
          { id: "s1", row: "1", number: 1, x: 0, y: 0, status: "available" },
          { id: "s2", row: "1", number: 2, x: 10, y: 0, status: "available" },
        ],
      },
    ],
  }
}

describe("draft seating map isolation", () => {
  it("aliases the flyer url onto the interactive map", () => {
    const seating = toDraftSeatingMap({
      url: "https://cdn.example/map.png",
      sectors: [],
    })
    assert.equal(seating.url, "https://cdn.example/map.png")
    assert.equal(seating.backgroundImage, "https://cdn.example/map.png")
  })

  it("builds map tickets from sector prices without touching generals", () => {
    const tickets = ticketsFromVenueMap(plateaMap())
    assert.equal(tickets.length, 1)
    assert.equal(tickets[0]?.source, "map")
    assert.equal(tickets[0]?.sectorId, "sector-platea")
    assert.equal(tickets[0]?.stock, 2)
    assert.equal(tickets[0]?.price, 18000)
  })

  it("merges map sectors without deleting general tickets", () => {
    const vip = {
      ...emptyEventDraftV2LineItem("vip-1"),
      name: "VIP",
      price: 25000,
      stock: 40,
      source: "general",
    }
    const staleMap = {
      ...emptyEventDraftV2LineItem("old-map"),
      name: "Viejo",
      source: "map",
      sectorId: "gone",
      stock: 10,
    }
    const merged = mergeDraftTicketsWithMap([vip, staleMap], plateaMap())
    assert.equal(merged.some((ticket) => ticket.id === "vip-1"), true)
    assert.equal(merged.some((ticket) => ticket.sectorId === "gone"), false)
    assert.equal(merged.some((ticket) => ticket.sectorId === "sector-platea"), true)
    assert.equal(isMapDraftTicket(vip), false)
  })

  it("keeps the live ticket id when rematching the same sector", () => {
    const existing = {
      ...emptyEventDraftV2LineItem("550e8400-e29b-41d4-a716-446655440099"),
      name: "Platea",
      source: "map",
      sectorId: "sector-platea",
      minOrder: 2,
      maxOrder: 4,
    }
    const merged = mergeDraftTicketsWithMap([existing], plateaMap())
    assert.equal(merged[0]?.id, "550e8400-e29b-41d4-a716-446655440099")
    assert.equal(merged[0]?.minOrder, 2)
    assert.equal(merged[0]?.maxOrder, 4)
  })

  it("drops map tickets when the canvas has no inventory", () => {
    const vip = {
      ...emptyEventDraftV2LineItem("vip-1"),
      name: "VIP",
      source: "general",
    }
    const mapTicket = {
      ...emptyEventDraftV2LineItem("map-1"),
      name: "Platea",
      source: "map",
      sectorId: "sector-platea",
    }
    const merged = mergeDraftTicketsWithMap([vip, mapTicket], emptyVenueMap())
    assert.deepEqual(
      merged.map((ticket) => ticket.id),
      ["vip-1"],
    )
  })
})
