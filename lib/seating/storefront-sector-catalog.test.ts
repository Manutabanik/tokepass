import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { createVenueElement } from "./venue-element-geometry"
import { listStorefrontSectorCatalog } from "./storefront-sector-catalog"
import { emptyVenueMap } from "@/types/venue-map"

describe("storefront-sector-catalog", () => {
  it("mete las mesas configuradas dentro del sector, no un acceso general", () => {
    const map = emptyVenueMap()
    map.zones = [
      {
        id: "sector-naranja",
        name: "Sector Naranja",
        color: "#f97316",
        price: 0,
        seatingType: "GENERAL",
        layoutType: "general",
        polygon: [
          { x: 10, y: 10 },
          { x: 40, y: 10 },
          { x: 40, y: 40 },
          { x: 10, y: 40 },
        ],
      },
    ]
    const mesa = createVenueElement("round_table", 0, { x: 200, y: 140 })
    mesa.id = "mesa-1"
    mesa.label = "1"
    mesa.groupId = "grupo-mesas"
    mesa.groupName = "Mesas"
    mesa.sectorName = "Mesas"
    mesa.zoneId = "sector-naranja"
    mesa.sellMode = "group"
    mesa.price = 0
    mesa.priceMode = "closed_unit"
    map.elements = [mesa]

    const catalog = listStorefrontSectorCatalog({
      map,
      priceBySectorId: { "sector-naranja": 45000 },
    })
    const sector = catalog.find((item) => item.id === "sector-naranja")
    assert.equal(sector?.kind, "reserved")
    assert.equal(sector?.options.length, 1)
    assert.equal(sector?.options[0]?.id, "mesa-1")
    assert.equal(sector?.options[0]?.kind, "table")
    assert.equal(sector?.options[0]?.price, 45000)
    assert.equal(
      catalog.some((item) => item.id === "grupo-mesas"),
      false,
    )
  })

  it("deja un sector sin muebles como acceso general", () => {
    const map = emptyVenueMap()
    map.zones = [
      {
        id: "pista",
        name: "PISTA",
        color: "#22c55e",
        price: 15000,
        seatingType: "GENERAL",
        layoutType: "general",
        polygon: [
          { x: 50, y: 50 },
          { x: 80, y: 50 },
          { x: 80, y: 80 },
          { x: 50, y: 80 },
        ],
      },
    ]
    const catalog = listStorefrontSectorCatalog({
      map,
      priceBySectorId: { pista: 15000 },
    })
    assert.equal(catalog[0]?.kind, "ga")
    assert.equal(catalog[0]?.options.length, 0)
    assert.equal(catalog[0]?.price, 15000)
  })
})
