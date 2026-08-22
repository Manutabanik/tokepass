import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { FlattenedVenueSeat } from "@/lib/seating/venue-map-geometry"

import {
  countAvailableSeatsForCategory,
  isCategorySoldOut,
  resolveCategoryAvailability,
} from "./category-stock"

function seat(
  patch: Partial<FlattenedVenueSeat> & Pick<FlattenedVenueSeat, "id">,
): FlattenedVenueSeat {
  return {
    row: "1",
    number: 1,
    x: 0,
    y: 0,
    sectorId: "grada-naranja",
    sectorName: "Grada Naranja",
    color: "#f97316",
    price: 90000,
    mapStatus: "available",
    source: "element",
    ...patch,
  }
}

describe("isCategorySoldOut", () => {
  it("uses GA stock when the category has no map", () => {
    assert.equal(
      isCategorySoldOut({ requiresMap: false, stock: 0 }),
      true,
    )
    assert.equal(
      isCategorySoldOut({ requiresMap: false, stock: 4 }),
      false,
    )
  })

  it("does not mark a mapped sector sold out from empty tier stock", () => {
    const seats = [
      seat({ id: "a1" }),
      seat({ id: "a2", number: 2 }),
    ]
    assert.equal(
      isCategorySoldOut({
        requiresMap: true,
        stock: 0,
        seatingSectorId: "grada-naranja",
        categoryName: "Grada Naranja",
        seats,
        occupancyBySeatId: {},
        mapReady: true,
      }),
      false,
    )
    assert.equal(
      countAvailableSeatsForCategory({
        requiresMap: true,
        stock: 0,
        seatingSectorId: "grada-naranja",
        seats,
      }),
      2,
    )
  })

  it("marks a mapped sector sold out only when every seat is taken", () => {
    const seats = [seat({ id: "a1" }), seat({ id: "a2", number: 2 })]
    assert.equal(
      isCategorySoldOut({
        requiresMap: true,
        stock: 99,
        seatingSectorId: "grada-naranja",
        seats,
        occupancyBySeatId: { a1: "occupied", a2: "occupied" },
        mapReady: true,
      }),
      true,
    )
  })

  it("never fakes sold-out when the map has no matching seats yet", () => {
    assert.equal(
      isCategorySoldOut({
        requiresMap: true,
        stock: 0,
        seatingSectorId: "grada-naranja",
        seats: [],
        mapReady: false,
      }),
      false,
    )
  })

  it("marks a mapped category sold out when the ready map has no stock", () => {
    assert.equal(
      isCategorySoldOut({
        requiresMap: true,
        stock: 0,
        seatingSectorId: "grada-naranja",
        seats: [],
        mapReady: true,
      }),
      true,
    )
  })

  it("treats a ready map sector with no seats or zone as unconfigured", () => {
    const result = resolveCategoryAvailability({
      requiresMap: true,
      stock: 12,
      seatingSectorId: "sector-lima",
      seats: [],
      mapReady: true,
      mapSectorIds: ["otra-zona"],
    })
    assert.equal(result.isSoldOut, true)
    assert.equal(result.isUnconfigured, true)
    assert.equal(result.available, 0)
  })

  it("keeps a mapped GA zone selectable when the zone exists on the map", () => {
    const result = resolveCategoryAvailability({
      requiresMap: true,
      stock: 8,
      seatingSectorId: "sector-lima",
      seats: [],
      mapReady: true,
      mapSectorIds: ["sector-lima"],
    })
    assert.equal(result.isUnconfigured, false)
    assert.equal(result.isSoldOut, false)
    assert.equal(result.available, 8)
  })

  it("matches zone-grouped tables by sector name", () => {
    const seats = [
      seat({
        id: "mesa-4",
        sectorId: "zone-naranja",
        sectorName: "Grada Naranja",
      }),
    ]
    const open = resolveCategoryAvailability({
      requiresMap: true,
      stock: 0,
      categoryName: "Grada Naranja",
      seats,
      occupancyBySeatId: {},
      mapReady: true,
    })
    assert.equal(open.isSoldOut, false)
    assert.equal(open.available, 1)
  })

  it("keeps sold-out label and action in sync for mapped seats", () => {
    const seats = [seat({ id: "a1" })]
    const sold = resolveCategoryAvailability({
      requiresMap: true,
      stock: 12,
      seatingSectorId: "grada-naranja",
      seats,
      occupancyBySeatId: { a1: "occupied" },
      mapReady: true,
    })
    assert.equal(sold.isSoldOut, true)
    assert.equal(sold.available, 0)

    const open = resolveCategoryAvailability({
      requiresMap: true,
      stock: 0,
      seatingSectorId: "grada-naranja",
      seats,
      occupancyBySeatId: {},
      mapReady: true,
    })
    assert.equal(open.isSoldOut, false)
    assert.equal(open.available, 1)
  })
})
