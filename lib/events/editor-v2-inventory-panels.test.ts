import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  inventoryExtrasErrorsOpenPanel,
  inventorySuperPanelForFieldPath,
  resolveInventorySuperPanel,
} from "./editor-v2-inventory-panels"

describe("inventorySuperPanelForFieldPath", () => {
  it("keeps capacity, tickets and maps on the tickets panel", () => {
    assert.equal(inventorySuperPanelForFieldPath("venueCapacity"), "tickets")
    assert.equal(inventorySuperPanelForFieldPath(["tickets", 0, "stock"]), "tickets")
    assert.equal(inventorySuperPanelForFieldPath("seatingMaps.0.mapConfig"), "tickets")
    assert.equal(inventorySuperPanelForFieldPath("seatingMap.sectors"), "tickets")
  })

  it("routes extras to the store panel", () => {
    assert.equal(inventorySuperPanelForFieldPath("extras.0.name"), "extras")
    assert.equal(inventorySuperPanelForFieldPath(["extras", 1, "stock"]), "extras")
  })
})

describe("resolveInventorySuperPanel", () => {
  it("opens extras when those fields have errors", () => {
    assert.equal(
      inventoryExtrasErrorsOpenPanel({
        extras: { 0: { name: { type: "manual", message: "Falta el extra" } } },
      }),
      true,
    )
    assert.equal(
      resolveInventorySuperPanel({
        extras: { 0: { stock: { type: "manual", message: "Falta stock" } } },
      }),
      "extras",
    )
  })

  it("prefers the field that publish asked to reveal", () => {
    assert.equal(
      resolveInventorySuperPanel(
        {
          extras: { 0: { name: { type: "manual", message: "Falta el extra" } } },
        },
        "tickets.0.stock",
      ),
      "tickets",
    )
  })
})
