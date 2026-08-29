import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { cartCompositeItemId } from "./cart-item-identity"
import {
  buildCheckoutActionItems,
  extraPlacesForCheckoutLock,
} from "./build-checkout-items"

const friday = "550e8400-e29b-41d4-a716-446655440001"
const saturday = "550e8400-e29b-41d4-a716-446655440002"
const fridayTier = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const saturdayTier = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const parking = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"

describe("buildCheckoutActionItems", () => {
  it("sends both jornadas and extras from the stamped cart", () => {
    const items = buildCheckoutActionItems({
      scheduleDayCount: 2,
      selectedDateId: friday,
      lines: [
        {
          id: cartCompositeItemId(fridayTier, friday, "tablon-16"),
          ticketTierId: fridayTier,
          name: "Grada Amarilla Viernes",
          quantity: 1,
          price: 30000,
          elementId: "tablon-16",
          scheduleId: friday,
          dateString: "Viernes 13 Nov",
        },
        {
          id: cartCompositeItemId(saturdayTier, saturday, "aaaaa"),
          ticketTierId: saturdayTier,
          name: "Grada Amarilla Sabado",
          quantity: 1,
          price: 100000,
          elementId: "aaaaa",
          scheduleId: saturday,
          dateString: "Sábado 14 Nov",
        },
        {
          id: cartCompositeItemId(parking, null),
          ticketTierId: parking,
          name: "Estacionamiento",
          quantity: 1,
          price: 3000,
        },
      ],
    })
    assert.equal(items.length, 3)
    const fridayLine = items.find((item) => item.ticketTierId === fridayTier)
    const saturdayLine = items.find((item) => item.ticketTierId === saturdayTier)
    const extra = items.find((item) => item.ticketTierId === parking)
    assert.equal(fridayLine?.type, "mapped")
    assert.equal(fridayLine?.eventDateId, friday)
    assert.equal(saturdayLine?.type, "mapped")
    assert.equal(saturdayLine?.eventDateId, saturday)
    assert.equal(extra?.type, "general")
    assert.equal(extra?.quantity, 1)
  })

  it("does not drop a Saturday place when the active tab is Friday", () => {
    const items = buildCheckoutActionItems({
      scheduleDayCount: 2,
      selectedDateId: friday,
      extraPlaces: [
        {
          id: "mesa-09",
          ticketTierId: saturdayTier,
          eventDateId: saturday,
        },
      ],
      lines: [],
    })
    assert.equal(items.length, 1)
    assert.equal(items[0]?.eventDateId, saturday)
    assert.equal(items[0]?.ticketTierId, saturdayTier)
  })

  it("sends a map zone as a general, not a numbered place", () => {
    const items = buildCheckoutActionItems({
      scheduleDayCount: 2,
      selectedDateId: friday,
      lines: [
        {
          id: cartCompositeItemId(fridayTier, friday),
          ticketTierId: fridayTier,
          name: "Campo",
          quantity: 2,
          price: 10000,
          sectorId: "campo",
          scheduleId: friday,
          isMappedSelection: false,
        },
      ],
    })
    assert.equal(items.length, 1)
    assert.equal(items[0]?.type, "general")
    assert.equal(items[0]?.quantity, 2)
    assert.equal(items[0]?.eventDateId, friday)
    assert.equal(items[0]?.elementId, undefined)
  })

  it("keeps generals stamped on both jornadas", () => {
    const items = buildCheckoutActionItems({
      scheduleDayCount: 2,
      selectedDateId: friday,
      lines: [
        {
          id: cartCompositeItemId(fridayTier, friday),
          ticketTierId: fridayTier,
          name: "General",
          quantity: 1,
          price: 20000,
          scheduleId: friday,
        },
        {
          id: cartCompositeItemId(fridayTier, saturday),
          ticketTierId: fridayTier,
          name: "General",
          quantity: 2,
          price: 20000,
          scheduleId: saturday,
        },
      ],
    })
    assert.equal(items.length, 2)
    const fridayLine = items.find((item) => item.eventDateId === friday)
    const saturdayLine = items.find((item) => item.eventDateId === saturday)
    assert.equal(fridayLine?.quantity, 1)
    assert.equal(saturdayLine?.quantity, 2)
  })

  it("does not lock a leftover combo mesa on a GA-only cart", () => {
    const comboTier = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    const lines = [
      {
        id: cartCompositeItemId(fridayTier, friday),
        ticketTierId: fridayTier,
        name: "General Viernes",
        quantity: 1,
        price: 15000,
        scheduleId: friday,
        isMappedSelection: false,
      },
    ]
    const leftover = extraPlacesForCheckoutLock(lines, [
      {
        id: "mesa-09",
        ticketTierId: comboTier,
        eventDateId: friday,
      },
    ])
    const items = buildCheckoutActionItems({
      scheduleDayCount: 2,
      selectedDateId: friday,
      extraPlaces: leftover,
      lines,
    })
    assert.equal(leftover.length, 0)
    assert.equal(items.length, 1)
    assert.equal(items[0]?.type, "general")
    assert.equal(items[0]?.ticketTierId, fridayTier)
    assert.equal(items[0]?.quantity, 1)
  })
})
