import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  cartCompositeItemId,
  cartLineSnapshot,
  cartMapUnitIdsForSchedule,
  cartQuantityOnSchedule,
  cartScheduleToken,
  dropUndatedGeneralState,
  freezeCartLineSnapshot,
  mergeImmutableCartLines,
  parseCartCompositeItemId,
  projectQuantitiesForSchedule,
  upsertGeneralCartLine,
  type CartIdentityLine,
} from "./cart-item-identity"

const friday = "550e8400-e29b-41d4-a716-446655440001"
const saturday = "550e8400-e29b-41d4-a716-446655440002"
const general = "550e8400-e29b-41d4-a716-446655440099"

describe("cartScheduleToken", () => {
  it("collapses poison tab tokens so they cannot diverge from _all", () => {
    assert.equal(cartScheduleToken("sin-fecha"), "all")
    assert.equal(cartScheduleToken("full_pass"), "all")
    assert.equal(cartScheduleToken("combo_packs"), "all")
    assert.equal(cartScheduleToken("all"), "all")
    assert.equal(cartScheduleToken(friday), friday)
  })
})

describe("cartCompositeItemId", () => {
  it("joins ticket and schedule ids", () => {
    assert.equal(cartCompositeItemId(general, friday), `${general}_${friday}`)
    assert.equal(cartCompositeItemId(general), `${general}_all`)
    assert.equal(
      cartCompositeItemId(general, friday, "mesa-04"),
      `${general}_${friday}_mesa-04`,
    )
  })

  it("parses the composite and the legacy ticket: prefix", () => {
    assert.deepEqual(parseCartCompositeItemId(`${general}_${friday}`), {
      ticketId: general,
      scheduleId: friday,
      unitId: null,
    })
    assert.deepEqual(parseCartCompositeItemId(`ticket:${general}__${friday}`), {
      ticketId: general,
      scheduleId: friday,
      unitId: null,
    })
  })
})

describe("upsertGeneralCartLine", () => {
  it("keeps friday and saturday as independent objects", () => {
    const fridayLine = upsertGeneralCartLine<CartIdentityLine>([], {
      ticketTierId: general,
      name: "General",
      price: 10000,
      quantity: 2,
      scheduleId: friday,
      dateString: "Viernes 13 Nov",
    })
    const both = upsertGeneralCartLine(fridayLine, {
      ticketTierId: general,
      name: "General",
      price: 10000,
      quantity: 1,
      scheduleId: saturday,
      dateString: "Sábado 14 Nov",
    })
    assert.equal(both.length, 2)
    assert.equal(
      both.find((line) => line.scheduleId === friday)?.quantity,
      2,
    )
    assert.equal(
      both.find((line) => line.scheduleId === saturday)?.dateString,
      "Sábado 14 Nov",
    )
  })

  it("does not rewrite a frozen snapshot when only quantity changes", () => {
    const [first] = upsertGeneralCartLine<CartIdentityLine>([], {
      ticketTierId: general,
      name: "General",
      price: 10000,
      quantity: 1,
      scheduleId: friday,
      dateString: "Viernes 13 Nov",
      sectorName: "Campo",
    })
    const [updated] = upsertGeneralCartLine([first!], {
      ticketTierId: general,
      name: "General",
      price: 12000,
      quantity: 3,
      scheduleId: friday,
      dateString: "Sábado 14 Nov",
      sectorName: "Otro",
    })
    assert.equal(updated?.quantity, 3)
    assert.equal(updated?.dateString, "Viernes 13 Nov")
    assert.equal(updated?.sectorName, "Campo")
    assert.equal(updated?.scheduleId, friday)
  })
})

describe("mergeImmutableCartLines", () => {
  it("does not replace a dated general with an undated rebuild", () => {
    const current: CartIdentityLine[] = [
      {
        id: cartCompositeItemId(general, friday),
        ticketTierId: general,
        name: "General",
        quantity: 2,
        price: 10000,
        scheduleId: friday,
        dateString: "Viernes 13 Nov",
      },
    ]
    const incoming: CartIdentityLine[] = [
      {
        id: cartCompositeItemId(general, null),
        ticketTierId: general,
        name: "General",
        quantity: 1,
        price: 10000,
      },
    ]
    const merged = mergeImmutableCartLines(current, incoming)
    assert.equal(merged.length, 2)
    assert.ok(merged.some((line) => line.scheduleId === friday && line.quantity === 2))
  })

  it("keeps the other day's lines when the active tab rebuilds", () => {
    const current: CartIdentityLine[] = [
      {
        id: cartCompositeItemId(general, friday),
        ticketTierId: general,
        name: "General",
        quantity: 2,
        price: 10000,
        scheduleId: friday,
        dateString: "Viernes 13 Nov",
      },
    ]
    const incoming: CartIdentityLine[] = [
      {
        id: cartCompositeItemId(general, saturday),
        ticketTierId: general,
        name: "General",
        quantity: 1,
        price: 10000,
        scheduleId: saturday,
        dateString: "Sábado 14 Nov",
      },
    ]
    const merged = mergeImmutableCartLines(current, incoming)
    assert.equal(merged.length, 2)
    assert.ok(merged.some((line) => line.scheduleId === friday && line.quantity === 2))
    assert.ok(merged.some((line) => line.scheduleId === saturday && line.quantity === 1))
  })

  it("replaces a same-day line even if the id format changed", () => {
    const current: CartIdentityLine[] = [
      {
        id: "seat-1",
        ticketTierId: general,
        name: "Grada",
        quantity: 1,
        price: 1,
        seatId: "seat-1",
        scheduleId: friday,
        dateString: "Viernes 13 Nov",
        seatLabel: "Mesa 04",
      },
    ]
    const incoming: CartIdentityLine[] = [
      {
        id: cartCompositeItemId(general, friday, "seat-1"),
        ticketTierId: general,
        name: "Grada",
        quantity: 1,
        price: 1,
        seatId: "seat-1",
        scheduleId: friday,
        dateString: "Sábado",
        seatLabel: "Mesa 99",
      },
    ]
    const merged = mergeImmutableCartLines(current, incoming)
    assert.equal(merged.length, 1)
    assert.equal(merged[0]?.id, cartCompositeItemId(general, friday, "seat-1"))
    assert.equal(merged[0]?.dateString, "Viernes 13 Nov")
    assert.equal(merged[0]?.seatLabel, "Mesa 04")
  })

  it("does not drop another day's general when a map place arrives", () => {
    const current: CartIdentityLine[] = [
      {
        id: cartCompositeItemId(general, friday),
        ticketTierId: general,
        name: "General",
        quantity: 2,
        price: 10000,
        scheduleId: friday,
        dateString: "Viernes 13 Nov",
      },
      {
        id: cartCompositeItemId(general, saturday),
        ticketTierId: general,
        name: "General",
        quantity: 1,
        price: 10000,
        scheduleId: saturday,
        dateString: "Sábado 14 Nov",
      },
    ]
    const incoming: CartIdentityLine[] = [
      {
        id: cartCompositeItemId(general, saturday, "tablon-16"),
        ticketTierId: general,
        name: "Grada",
        quantity: 1,
        price: 30000,
        elementId: "tablon-16",
        scheduleId: saturday,
      },
      current[0]!,
    ]
    const merged = mergeImmutableCartLines(current, incoming)
    assert.ok(merged.some((line) => line.scheduleId === friday && !line.elementId))
    assert.ok(merged.some((line) => line.scheduleId === saturday && !line.elementId))
    assert.ok(merged.some((line) => line.elementId === "tablon-16"))
  })

  it("drops a cleared general when that jornada is rebuilt", () => {
    const current: CartIdentityLine[] = [
      {
        id: cartCompositeItemId(general, friday),
        ticketTierId: general,
        name: "General",
        quantity: 2,
        price: 10000,
        scheduleId: friday,
      },
    ]
    const merged = mergeImmutableCartLines(current, [], {
      replaceGeneralDays: [friday],
    })
    assert.equal(merged.length, 0)
  })
})

describe("cartLineSnapshot", () => {
  it("freezes schedule, date, sector and seat label", () => {
    const snap = cartLineSnapshot({
      scheduleId: friday,
      dateString: "Viernes 13 Nov",
      sectorName: "Grada Naranja",
      seatLabel: "Mesa 04",
    })
    assert.deepEqual(snap, {
      scheduleId: friday,
      dateString: "Viernes 13 Nov",
      sectorName: "Grada Naranja",
      seatLabel: "Mesa 04",
    })
    const frozen = freezeCartLineSnapshot(
      {
        id: "x",
        name: "Grada Naranja",
        quantity: 1,
        price: 1,
        scheduleId: saturday,
        dateString: "Sábado",
        sectorName: "Otra",
        seatLabel: "Mesa 99",
      },
      {
        scheduleId: friday,
        dateString: "Viernes 13 Nov",
        sectorName: "Grada Naranja",
        seatLabel: "Mesa 04",
      },
    )
    assert.equal(frozen.seatLabel, "Mesa 04")
    assert.equal(frozen.scheduleId, friday)
  })
})

describe("projectQuantitiesForSchedule", () => {
  it("exposes only the active day's general qty under the ticket id", () => {
    const lines = upsertGeneralCartLine(
      upsertGeneralCartLine<CartIdentityLine>([], {
        ticketTierId: general,
        name: "General",
        price: 1,
        quantity: 2,
        scheduleId: friday,
        dateString: "Vie",
      }),
      {
        ticketTierId: general,
        name: "General",
        price: 1,
        quantity: 4,
        scheduleId: saturday,
        dateString: "Sab",
      },
    )
    const fridayQty = projectQuantitiesForSchedule({}, lines, friday)
    const saturdayQty = projectQuantitiesForSchedule({}, lines, saturday)
    assert.equal(fridayQty[general], 2)
    assert.equal(saturdayQty[general], 4)
  })

  it("reads composite quantity keys for the active day", () => {
    const quantities = {
      [cartCompositeItemId(general, friday)]: 2,
      [cartCompositeItemId(general, saturday)]: 4,
    }
    assert.equal(
      projectQuantitiesForSchedule(quantities, [], friday)[general],
      2,
    )
    assert.equal(
      projectQuantitiesForSchedule(quantities, [], saturday)[general],
      4,
    )
  })

  it("reads 0 when the active jornada has no composite match", () => {
    const quantities = {
      [cartCompositeItemId(general, friday)]: 2,
    }
    assert.equal(cartQuantityOnSchedule(quantities, general, saturday), 0)
    assert.equal(cartQuantityOnSchedule(quantities, general, friday), 2)
    assert.equal(
      projectQuantitiesForSchedule(quantities, [], saturday)[general] ?? 0,
      0,
    )
    assert.equal(
      projectQuantitiesForSchedule(
        { [general]: 9, ...quantities },
        [],
        saturday,
      )[general] ?? 0,
      0,
    )
  })

  it("does not leak an undated line onto a selected jornada", () => {
    const lines = [
      {
        id: general,
        ticketTierId: general,
        name: "General",
        quantity: 3,
        price: 1,
      },
    ]
    assert.equal(
      projectQuantitiesForSchedule({}, lines, friday)[general] ?? 0,
      0,
    )
  })
})

describe("dropUndatedGeneralState", () => {
  it("removes leftover _all qty and lines once a jornada key exists", () => {
    const dated = upsertGeneralCartLine<CartIdentityLine>([], {
      ticketTierId: general,
      name: "General",
      price: 1,
      quantity: 2,
      scheduleId: friday,
      dateString: "Vie",
    })
    const mixed: CartIdentityLine[] = [
      ...dated,
      {
        id: cartCompositeItemId(general, null),
        ticketTierId: general,
        name: "General",
        quantity: 1,
        price: 1,
      },
    ]
    const cleaned = dropUndatedGeneralState(
      {
        [cartCompositeItemId(general, friday)]: 2,
        [cartCompositeItemId(general, null)]: 1,
        [general]: 1,
      },
      mixed,
      general,
      friday,
    )
    assert.equal(cleaned.quantities[cartCompositeItemId(general, friday)], 2)
    assert.equal(cleaned.quantities[cartCompositeItemId(general, null)], undefined)
    assert.equal(cleaned.quantities[general], undefined)
    assert.equal(cleaned.lines.length, 1)
    assert.equal(cleaned.lines[0]?.scheduleId, friday)
  })

  it("keeps the same quantity and line refs when nothing undated remains", () => {
    const dated = upsertGeneralCartLine<CartIdentityLine>([], {
      ticketTierId: general,
      name: "General",
      price: 1,
      quantity: 2,
      scheduleId: friday,
      dateString: "Vie",
    })
    const quantities = {
      [cartCompositeItemId(general, friday)]: 2,
    }
    const cleaned = dropUndatedGeneralState(quantities, dated, general, friday)
    assert.equal(cleaned.quantities, quantities)
    assert.equal(cleaned.lines, dated)
  })
})

describe("cartMapUnitIdsForSchedule", () => {
  it("keeps only map places stamped on the rendered jornada", () => {
    const lines = [
      {
        id: cartCompositeItemId(general, friday, "mesa-04"),
        ticketTierId: general,
        name: "Grada",
        quantity: 1,
        price: 1,
        seatId: "mesa-04",
        scheduleId: friday,
      },
      {
        id: cartCompositeItemId(general, saturday, "mesa-04"),
        ticketTierId: general,
        name: "Grada",
        quantity: 1,
        price: 1,
        seatId: "mesa-04",
        scheduleId: saturday,
      },
    ]
    assert.deepEqual(cartMapUnitIdsForSchedule(lines, friday), ["mesa-04"])
    assert.deepEqual(cartMapUnitIdsForSchedule(lines, saturday), ["mesa-04"])
    assert.deepEqual(
      cartMapUnitIdsForSchedule(
        lines.filter((line) => line.scheduleId === friday),
        saturday,
      ),
      [],
    )
  })
})
