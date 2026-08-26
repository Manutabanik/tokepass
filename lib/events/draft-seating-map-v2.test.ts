import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  cloneDraftSeatingMapInstance,
  configuredDraftSeatingMapDateIds,
  garbageCollectDraftTickets,
  isMapDraftTicket,
  isOrphanMapTicket,
  mergeDraftTicketsWithDayMap,
  mergeDraftTicketsWithMap,
  mergeDraftTicketsWithScheduleMaps,
  parseDraftSeatingMaps,
  sanitizeDraftTicketsForPersist,
  ticketsFromVenueMap,
  toDraftSeatingMap,
  upsertDraftSeatingMapInstance,
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
    assert.equal(
      isMapDraftTicket({ source: "general", sectorId: "gone" }),
      false,
    )
  })

  it("clears leftover sector ids on general tickets and drops orphan map tickets", () => {
    const leftover = {
      ...emptyEventDraftV2LineItem("vip-1"),
      name: "VIP",
      source: "general",
      sectorId: "sector-borrado",
    }
    const cleared = sanitizeDraftTicketsForPersist([leftover], {
      mapActive: false,
      liveSectorIds: [],
    })
    assert.equal(cleared[0]?.sectorId, "")
    assert.equal(cleared[0]?.source, "general")

    const orphanMap = {
      ...emptyEventDraftV2LineItem("map-1"),
      name: "Viejo",
      source: "map",
      sectorId: "sector-borrado",
      layoutType: "numbered_seat",
    }
    const live = {
      ...emptyEventDraftV2LineItem("map-2"),
      name: "Platea",
      source: "map",
      sectorId: "sector-platea",
    }
    const detached = sanitizeDraftTicketsForPersist([orphanMap, live], {
      mapActive: true,
      liveSectorIds: ["sector-platea"],
    })
    assert.equal(detached.length, 1)
    assert.equal(detached[0]?.sectorId, "sector-platea")
    assert.equal(
      isOrphanMapTicket(orphanMap, ["sector-platea"]),
      true,
    )
    assert.deepEqual(
      garbageCollectDraftTickets([orphanMap, live], ["sector-platea"]).map(
        (ticket) => ticket.id,
      ),
      ["map-2"],
    )
  })

  it("never deletes general or extra tickets without seating_sector_id", () => {
    const general = {
      ...emptyEventDraftV2LineItem("vip-1"),
      name: "Entrada General",
      source: "general",
      sectorId: "sector-residual",
      seatingSectorId: null,
      seating_sector_id: null,
    }
    const extra = {
      ...emptyEventDraftV2LineItem("extra-1"),
      name: "Estacionamiento",
      source: "",
      ticketType: "extra",
      sectorId: "sector-residual",
      seatingSectorId: undefined,
      seating_sector_id: undefined,
    }
    const untitled = {
      ...emptyEventDraftV2LineItem("free-1"),
      name: "Sin mapa",
      source: undefined,
      sectorId: "",
    }
    assert.equal(isOrphanMapTicket(general, []), false)
    assert.equal(isOrphanMapTicket(extra, []), false)
    assert.equal(isOrphanMapTicket(untitled, []), false)
    assert.deepEqual(
      garbageCollectDraftTickets([general, extra, untitled], []).map(
        (ticket) => ticket.id,
      ),
      ["vip-1", "extra-1", "free-1"],
    )
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

  it("keeps map tickets of other days when saving a day instance", () => {
    const dayA = "day-a"
    const dayB = "day-b"
    const vip = {
      ...emptyEventDraftV2LineItem("vip-1"),
      name: "VIP",
      source: "general",
    }
    const dayATicket = {
      ...emptyEventDraftV2LineItem("map:day-a:old"),
      name: "Platea A",
      source: "map",
      sectorId: "old-a",
      validDayIds: [dayA],
    }
    const merged = mergeDraftTicketsWithDayMap(
      [vip, dayATicket],
      plateaMap(),
      dayB,
    )
    assert.equal(merged.some((ticket) => ticket.id === "vip-1"), true)
    assert.equal(merged.some((ticket) => ticket.id === "map:day-a:old"), true)
    const dayBTicket = merged.find((ticket) =>
      ticket.id.startsWith("map:day-b:"),
    )
    assert.equal(dayBTicket?.validDayIds?.[0], dayB)
    assert.equal(dayBTicket?.sectorId, "sector-platea")
  })

  it("migrates a legacy global seatingMap into seatingMaps", () => {
    const maps = parseDraftSeatingMaps(
      [],
      { url: "https://cdn.example/map.png", sectors: [{ id: "a" }] },
      "day-1",
    )
    assert.equal(maps.length, 1)
    assert.equal(maps[0]?.dateId, "day-1")
    assert.equal(maps[0]?.mapConfig.sectors.length, 1)
  })

  it("upserts a day instance without dropping the other day", () => {
    const first = upsertDraftSeatingMapInstance([], "day-a", plateaMap())
    const next = upsertDraftSeatingMapInstance(first, "day-b", emptyVenueMap())
    assert.equal(next.length, 2)
    assert.equal(next[0]?.dateId, "day-a")
    assert.equal(next[1]?.dateId, "day-b")
  })

  it("lists only days that already have a valid mapConfig", () => {
    const maps = upsertDraftSeatingMapInstance([], "day-a", plateaMap())
    maps.push({
      dateId: "day-empty",
      mapConfig: toDraftSeatingMap(emptyVenueMap()),
      pricing: { sectorPrices: {}, blockedSeatIds: [] },
    })
    assert.deepEqual(configuredDraftSeatingMapDateIds(maps), ["day-a"])
  })

  it("deep-clones geometry and pricing onto another day", () => {
    const [source] = upsertDraftSeatingMapInstance([], "day-a", plateaMap())
    assert.ok(source)
    const cloned = cloneDraftSeatingMapInstance(source, "day-b")
    assert.equal(cloned.dateId, "day-b")
    assert.notEqual(cloned.mapConfig, source.mapConfig)
    assert.notEqual(cloned.pricing, source.pricing)
    cloned.pricing.sectorPrices["sector-platea"] = 1
    assert.equal(source.pricing.sectorPrices["sector-platea"], 18000)
    const clonedSectors = cloned.mapConfig.sectors as Array<{ price?: number }>
    if (clonedSectors[0]) clonedSectors[0].price = 1
    const sourceSectors = source.mapConfig.sectors as Array<{ price?: number }>
    assert.equal(sourceSectors[0]?.price, 18000)
    assert.equal(
      (cloned.mapConfig.sectors as Array<{ id?: string }>)[0]?.id,
      "sector-platea",
    )
  })

  it("preserves sector ids when the editor resaves the same named sector", () => {
    const first = upsertDraftSeatingMapInstance([], "day-a", plateaMap())
    const renamedId = {
      ...plateaMap(),
      sectors: plateaMap().sectors.map((sector) => ({
        ...sector,
        id: "sec-regenerado",
        seats: sector.seats.map((seat, index) => ({
          ...seat,
          id: `sec-regenerado-S${index + 1}`,
        })),
      })),
    }
    const next = upsertDraftSeatingMapInstance(first, "day-a", renamedId)
    assert.equal(
      (next[0]?.mapConfig.sectors as Array<{ id?: string }>)[0]?.id,
      "sector-platea",
    )
  })

  it("rebinds a map ticket by sector name when the id changed", () => {
    const stale = {
      ...emptyEventDraftV2LineItem("map-old"),
      name: "Platea",
      source: "map",
      sectorId: "sec-viejo",
    }
    const merged = mergeDraftTicketsWithDayMap([stale], plateaMap(), "day-a")
    assert.equal(merged.length, 1)
    assert.equal(merged[0]?.sectorId, "sector-platea")
    assert.equal(merged[0]?.id, "map-old")
  })

  it("creates one map ticket per schedule day for the same sector", () => {
    const merged = mergeDraftTicketsWithScheduleMaps(
      [],
      plateaMap(),
      "day-a",
      ["day-a", "day-b"],
      [],
    )
    const platea = merged.filter((ticket) => ticket.sectorId === "sector-platea")
    assert.equal(platea.length, 2)
    assert.deepEqual(
      platea.map((ticket) => ticket.validDayIds?.[0]).sort(),
      ["day-a", "day-b"],
    )
  })

  it("heals a stale seating_sector_id by name before garbage collection", () => {
    const stale = {
      ...emptyEventDraftV2LineItem("map-old"),
      name: "Platea",
      source: "map",
      sectorId: "sec-viejo",
      seating_sector_id: "sec-viejo",
    }
    const kept = sanitizeDraftTicketsForPersist([stale], {
      mapActive: true,
      liveSectorIds: ["sector-platea"],
      liveSectors: [{ id: "sector-platea", name: "Platea" }],
    })
    assert.equal(kept.length, 1)
    assert.equal(kept[0]?.sectorId, "sector-platea")
  })
})
