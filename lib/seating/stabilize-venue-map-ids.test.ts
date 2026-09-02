import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  collectNamedMapSectorIds,
  healTicketSeatingSector,
  stabilizeVenueMapIds,
} from "@/lib/seating/stabilize-venue-map-ids"
import { venueElement } from "@/tests/fixtures/venue-map"
import { emptyVenueMap, parseVenueMap } from "@/types/venue-map"

function grada(id: string) {
  return {
    id,
    name: "Grada Naranja",
    color: "#f97316",
    price: 12000,
    x: 0,
    y: 0,
    rows: 1,
    seatsPerRow: 2,
    curvature: 0,
    aisle: false,
    seats: [
      { id: `${id}-S1`, row: "1", number: 1, x: 0, y: 0, status: "available" as const },
      { id: `${id}-S2`, row: "1", number: 2, x: 10, y: 0, status: "available" as const },
    ],
  }
}

describe("stabilize-venue-map-ids", () => {
  it("keeps the sector id when the organizer only renames it", () => {
    const previous = { ...emptyVenueMap(), sectors: [grada("grada-naranja")] }
    const incoming = {
      ...emptyVenueMap(),
      sectors: [{ ...grada("grada-naranja"), name: "Grada Coral" }],
    }
    const stable = stabilizeVenueMapIds(previous, incoming)
    assert.equal(stable.sectors[0]?.id, "grada-naranja")
    assert.equal(stable.sectors[0]?.name, "Grada Coral")
  })

  it("keeps a furniture group id when only the display name changes", () => {
    const table = venueElement({
      id: "mesa-1",
      type: "round_table",
      x: 10,
      y: 10,
      label: "Mesa 01",
      capacity: 8,
      price: 70000,
      color: "#f97316",
      groupId: "grada-naranja",
      groupName: "Grada Naranja",
      sectorName: "Grada Naranja",
    })
    const previous = { ...emptyVenueMap(), elements: [table] }
    const incoming = {
      ...emptyVenueMap(),
      elements: [{ ...table, groupName: "Grada Coral", sectorName: "Grada Coral" }],
    }
    const stable = stabilizeVenueMapIds(previous, incoming)
    assert.equal(stable.elements[0]?.groupId, "grada-naranja")
    assert.equal(stable.elements[0]?.groupName, "Grada Coral")
  })

  it("does not heal a ticket onto another sector when two names collide", () => {
    const live = collectNamedMapSectorIds({
      ...emptyVenueMap(),
      sectors: [grada("grada-naranja"), { ...grada("otra"), name: "Naranja" }],
    })
    const healed = healTicketSeatingSector(
      {
        name: "Grada Naranja",
        source: "map",
        sectorId: "sec-viejo",
        seating_sector_id: "sec-viejo",
      },
      live,
    )
    assert.equal(healed.sectorId, "sec-viejo")
  })

  it("keeps the original sector id when the name still matches", () => {
    const previous = { ...emptyVenueMap(), sectors: [grada("sector-grada")] }
    const incoming = { ...emptyVenueMap(), sectors: [grada("sec-newid")] }
    const stable = stabilizeVenueMapIds(previous, incoming)
    assert.equal(stable.sectors[0]?.id, "sector-grada")
    assert.equal(stable.sectors[0]?.seats[0]?.id, "sector-grada-S1")
  })

  it("reuses Friday sector ids when Saturday is drawn with the same names", () => {
    const friday = { ...emptyVenueMap(), sectors: [grada("sector-grada")] }
    const saturday = { ...emptyVenueMap(), sectors: [grada("sec-saturday")] }
    const stable = stabilizeVenueMapIds(null, saturday, [friday])
    assert.equal(stable.sectors[0]?.id, "sector-grada")
  })

  it("heals a stale seating_sector_id by sector name", () => {
    const live = collectNamedMapSectorIds({
      ...emptyVenueMap(),
      sectors: [grada("sector-grada")],
    })
    const healed = healTicketSeatingSector(
      {
        name: "Grada Naranja",
        source: "map",
        sectorId: "sec-viejo",
        seating_sector_id: "sec-viejo",
      },
      live,
    )
    assert.equal(healed.sectorId, "sector-grada")
    assert.equal(healed.seating_sector_id, "sector-grada")
  })

  it("does not invent random ids when the same nameless sector is parsed twice", () => {
    const raw = {
      sectors: [
        {
          name: "Platea",
          seats: [{ row: "1", number: 1, x: 0, y: 0, status: "available" }],
        },
      ],
    }
    const first = parseVenueMap(raw)
    const second = parseVenueMap(raw)
    assert.equal(first.sectors[0]?.id, second.sectors[0]?.id)
    assert.equal(first.sectors[0]?.id, "sector-platea-1")
  })
})
