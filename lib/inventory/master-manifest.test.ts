import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildMasterManifestRows,
  dropdownGeneralSectors,
  MANIFEST_ORIGIN,
  MANIFEST_STATUS,
} from "@/lib/inventory/master-manifest"
import { emptyVenueMap } from "@/types/venue-map"

describe("buildMasterManifestRows", () => {
  it("lista el mapa primero y las generales abajo, sin mezclar orígenes", () => {
    const map = emptyVenueMap()
    map.sectors = [
      {
        id: "platea-vip",
        name: "Platea VIP",
        color: "#f97316",
        price: 0,
        x: 0,
        y: 0,
        rows: 1,
        seatsPerRow: 2,
        curvature: 0,
        aisle: false,
        seats: [
          { id: "a", row: "1", number: 1, x: 0, y: 0, status: "available" },
          { id: "b", row: "1", number: 2, x: 10, y: 0, status: "available" },
        ],
      },
    ]

    const rows = buildMasterManifestRows({
      venueMap: map,
      tickets: [
        {
          name: "Campo",
          capacity: 200,
          tierType: "general",
          layoutType: "general",
          seatingSectorId: null,
        },
        {
          name: "Butaca mapa",
          capacity: 2,
          tierType: "seated",
          layoutType: "numbered_seat",
          seatingSectorId: "platea-vip",
        },
        {
          name: "Estacionamiento",
          capacity: 40,
          tierType: "addon",
          layoutType: "general",
        },
      ],
    })

    assert.equal(rows[0]?.originLabel, MANIFEST_ORIGIN.map)
    assert.equal(rows[0]?.statusLabel, MANIFEST_STATUS.synced)
    assert.equal(rows[0]?.name, "Platea VIP")
    assert.equal(rows[0]?.capacity, 2)
    assert.equal(rows.at(-1)?.originLabel, MANIFEST_ORIGIN.custom)
    assert.equal(rows.at(-1)?.statusLabel, MANIFEST_STATUS.independent)
    assert.equal(rows.at(-1)?.name, "Campo")
    assert.equal(
      rows.some((row) => row.name === "Butaca mapa" || row.name === "Estacionamiento"),
      false,
    )
  })

  it("permite un manifiesto solo con entradas flotantes", () => {
    const rows = buildMasterManifestRows({
      tickets: [
        {
          name: "VIP libre",
          capacity: 80,
          tierType: "general",
          seatingSectorId: null,
        },
      ],
    })
    assert.equal(rows.length, 1)
    assert.equal(rows[0]?.origin, "custom")
    assert.equal(rows[0]?.capacity, 80)
  })
})

describe("dropdownGeneralSectors", () => {
  it("excluye sectores que pertenecen al mapa", () => {
    const map = emptyVenueMap()
    map.sectors = [
      {
        id: "platea-vip",
        name: "Platea VIP",
        color: "#f97316",
        price: 0,
        x: 0,
        y: 0,
        rows: 1,
        seatsPerRow: 1,
        curvature: 0,
        aisle: false,
        seats: [],
      },
    ]

    const sectors = dropdownGeneralSectors(
      [
        {
          id: "general:pista",
          name: "Pista",
          type: "general_admission",
          capacity: 300,
        },
        {
          id: "platea-vip",
          name: "Platea VIP",
          type: "general_admission",
          capacity: 40,
        },
      ],
      map,
    )

    assert.deepEqual(
      sectors.map((sector) => sector.id),
      ["general:pista"],
    )
  })
})
