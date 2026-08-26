import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  collectNamedMapSectorIds,
  healTicketSeatingSector,
  stabilizeVenueMapIds,
} from "@/lib/seating/stabilize-venue-map-ids"
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
