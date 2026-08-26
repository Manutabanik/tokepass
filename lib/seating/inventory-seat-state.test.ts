import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  inventoryStateToSeatStatus,
  mergeInventoryOccupancy,
  occupancyFromSeatHolds,
  resolveInventorySeatState,
  SEAT_HELD_BY_OTHER_MESSAGE,
  seatHoldRealtimePatch,
  seatStatusToInventoryState,
} from "./inventory-seat-state"

describe("inventory-seat-state", () => {
  it("keeps the exact held-by-other buyer copy", () => {
    assert.equal(
      SEAT_HELD_BY_OTHER_MESSAGE,
      "Asiento en proceso de compra. Alguien lo tiene en su carrito y podría liberarse en unos minutos. ¡Mantené la vista aquí!",
    )
  })

  it("resolves AVAILABLE, HELD and SOLD from tickets plus seat_holds", () => {
    assert.equal(resolveInventorySeatState({}), "AVAILABLE")
    assert.equal(
      resolveInventorySeatState({
        holdExpiresAt: "2099-01-01T00:00:00.000Z",
      }),
      "HELD",
    )
    assert.equal(
      resolveInventorySeatState({
        unitStatus: "reserved",
        reservedUntil: "2099-01-01T00:00:00.000Z",
      }),
      "HELD",
    )
    assert.equal(
      resolveInventorySeatState({
        unitStatus: "reserved",
        reservedUntil: "2020-01-01T00:00:00.000Z",
        nowMs: Date.parse("2026-08-16T00:00:00.000Z"),
      }),
      "AVAILABLE",
    )
    assert.equal(resolveInventorySeatState({ sold: true }), "SOLD")
    assert.equal(resolveInventorySeatState({ unitStatus: "sold" }), "SOLD")
    assert.equal(resolveInventorySeatState({ unitStatus: "blocked" }), "SOLD")
  })

  it("maps inventory states to seat occupancy colors", () => {
    assert.equal(inventoryStateToSeatStatus("AVAILABLE"), "available")
    assert.equal(inventoryStateToSeatStatus("HELD"), "held")
    assert.equal(inventoryStateToSeatStatus("SOLD"), "occupied")
    assert.equal(seatStatusToInventoryState("held"), "HELD")
    assert.equal(seatStatusToInventoryState("occupied"), "SOLD")
    assert.equal(seatStatusToInventoryState("blocked"), "SOLD")
  })

  it("never lets a hold or release overwrite a sold seat", () => {
    const merged = mergeInventoryOccupancy(
      { a: "occupied", b: "available" },
      { a: "held", b: "held", c: "held" },
      { a: "available", b: "available" },
    )
    assert.equal(merged.a, "occupied")
    assert.equal(merged.b, "available")
    assert.equal(merged.c, "held")
  })

  it("keeps pending_payment holds painted even after expires_at", () => {
    const occupancy = occupancyFromSeatHolds(
      [
        {
          layoutItemId: "s-frozen",
          expiresAt: "2020-01-01T00:00:00.000Z",
          status: "pending_payment",
        },
      ],
      { nowMs: Date.parse("2026-08-16T00:00:00.000Z") },
    )
    assert.equal(occupancy["s-frozen"], "held")
  })

  it("builds occupancy from active seat_holds and ignores other dates", () => {
    const occupancy = occupancyFromSeatHolds(
      [
        {
          layoutItemId: "s-1",
          expiresAt: "2099-01-01T00:00:00.000Z",
          eventDateId: "day-1",
        },
        {
          layoutItemId: "s-2",
          expiresAt: "2099-01-01T00:00:00.000Z",
          eventDateId: "day-2",
        },
        {
          layoutItemId: "s-3",
          expiresAt: "2020-01-01T00:00:00.000Z",
          eventDateId: "day-1",
        },
      ],
      {
        eventDateId: "day-1",
        nowMs: Date.parse("2026-08-16T00:00:00.000Z"),
      },
    )
    assert.equal(occupancy["s-1"], "held")
    assert.equal(occupancy["s-2"], undefined)
    assert.equal(occupancy["s-3"], undefined)
  })

  it("patches INSERT to held and DELETE/expired to available", () => {
    assert.deepEqual(
      seatHoldRealtimePatch("INSERT", {
        layout_item_id: "s-1",
        expires_at: "2099-01-01T00:00:00.000Z",
        event_date_id: "day-1",
      }),
      { "s-1": "held" },
    )
    assert.deepEqual(
      seatHoldRealtimePatch("DELETE", {
        layout_item_id: "s-1",
        expires_at: "2099-01-01T00:00:00.000Z",
        event_date_id: "day-1",
      }),
      { "s-1": "available" },
    )
    assert.deepEqual(
      seatHoldRealtimePatch(
        "UPDATE",
        {
          layout_item_id: "s-1",
          expires_at: "2020-01-01T00:00:00.000Z",
          event_date_id: "day-1",
        },
        { nowMs: Date.parse("2026-08-16T00:00:00.000Z") },
      ),
      { "s-1": "available" },
    )
    assert.equal(
      seatHoldRealtimePatch(
        "INSERT",
        {
          layout_item_id: "s-1",
          expires_at: "2099-01-01T00:00:00.000Z",
          event_date_id: "day-2",
        },
        { eventDateId: "day-1" },
      ),
      null,
    )
  })
})
