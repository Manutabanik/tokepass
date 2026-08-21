import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { posEventHasInteractiveMap } from "@/lib/pos-map"

describe("POS interactive map flag", () => {
  it("hides the map when there is no numbered inventory", () => {
    assert.equal(posEventHasInteractiveMap(null), false)
    assert.equal(posEventHasInteractiveMap({}), false)
    assert.equal(
      posEventHasInteractiveMap({
        zones: [
          {
            id: "campo",
            name: "Campo",
            color: "#22d3ee",
            price: 10000,
            polygon: [
              { x: 10, y: 10 },
              { x: 40, y: 10 },
              { x: 40, y: 40 },
            ],
          },
        ],
      }),
      false,
    )
  })

  it("shows the map when there are sellable seats or tables", () => {
    assert.equal(
      posEventHasInteractiveMap({
        elements: [
          {
            id: "mesa-12",
            type: "round_table",
            label: "Mesa 12",
            x: 40,
            y: 40,
            width: 28,
            height: 28,
            price: 15000,
          },
        ],
      }),
      true,
    )
    assert.equal(
      posEventHasInteractiveMap(
        {},
        {
          sectors: [
            {
              id: "platea",
              name: "Platea",
              color: "#22c55e",
              price: 10000,
              x: 10,
              y: 10,
              rows: 1,
              seatsPerRow: 2,
              curvature: 0,
              aisle: false,
              seats: [
                {
                  id: "platea-1-1",
                  row: "1",
                  number: 1,
                  x: 12,
                  y: 12,
                  status: "available",
                },
              ],
            },
          ],
        },
      ),
      true,
    )
  })
})
