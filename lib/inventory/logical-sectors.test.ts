import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  listAssignableGeneralSectors,
  listGeneralLogicalSectors,
  zoneIndexForSectorId,
} from "@/lib/inventory/logical-sectors"
import { emptyVenueMap } from "@/types/venue-map"

describe("listAssignableGeneralSectors", () => {
  it("excluye sectores numerados del mapa y deja los generales del organizador", () => {
    const map = emptyVenueMap()
    map.sectors = [
      {
        id: "platea-vip",
        name: "Platea VIP",
        color: "#f97316",
        price: 0,
        x: 0,
        y: 0,
        rows: 2,
        seatsPerRow: 4,
        curvature: 0,
        aisle: false,
        seats: [],
      },
    ]

    const sectors = listAssignableGeneralSectors(
      [
        {
          id: "general:pista",
          name: "Pista",
          type: "general_admission",
          capacity: 200,
        },
        {
          id: "platea-vip",
          name: "Platea VIP",
          type: "general_admission",
          capacity: 40,
        },
        {
          id: "mesa-1",
          name: "Mesas",
          type: "reserved_seating",
          capacity: 12,
        },
      ],
      map,
    )

    assert.deepEqual(
      sectors.map((sector) => sector.id),
      ["general:pista"],
    )
    assert.equal(
      listGeneralLogicalSectors([
        {
          id: "platea-vip",
          name: "Platea VIP",
          type: "general_admission",
          capacity: 40,
        },
      ]).length,
      1,
    )
  })

  it("devuelve -1 si la entrada no tiene sector", () => {
    assert.equal(
      zoneIndexForSectorId(
        [{ id: "general:pista" }],
        null,
      ),
      -1,
    )
    assert.equal(
      zoneIndexForSectorId([{ id: "general:pista" }], "general:pista"),
      0,
    )
  })
})
