import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  bumpPosCart,
  posCartItemCount,
  posSeatPickKey,
  posSeatPickMatchesDay,
  splitPosQuantity,
  togglePosSeatPick,
} from "@/lib/pos-cart"

describe("POS cart", () => {
  it("adds and removes lines without going over stock", () => {
    const added = bumpPosCart({}, "a", 1, 2)
    assert.deepEqual(added, { a: 1 })
    const full = bumpPosCart(added, "a", 5, 2)
    assert.deepEqual(full, { a: 2 })
    const cleared = bumpPosCart(full, "a", -2, 2)
    assert.deepEqual(cleared, {})
    assert.equal(posCartItemCount(full), 2)
  })

  it("splits quantities to the POS RPC cap", () => {
    assert.deepEqual(splitPosQuantity(45), [20, 20, 5])
    assert.deepEqual(splitPosQuantity(0), [])
  })

  it("keeps the same mesa unique per jornada", () => {
    const friday = {
      seatId: "mesa-09",
      eventDateId: "day-fri",
      tierId: "t1",
      label: "Mesa 09",
      sectorName: "VIP",
      price: 10,
    }
    const saturday = { ...friday, eventDateId: "day-sat" }
    assert.notEqual(posSeatPickKey(friday), posSeatPickKey(saturday))
    const addedFri = togglePosSeatPick([], friday)
    const addedSat = togglePosSeatPick(addedFri.picks, saturday)
    assert.equal(addedSat.picks.length, 2)
    const removedFri = togglePosSeatPick(addedSat.picks, friday)
    assert.equal(removedFri.picks.length, 1)
    assert.equal(removedFri.picks[0]?.eventDateId, "day-sat")
  })

  it("does not paint an undated hold on another jornada", () => {
    const friday = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    const saturday = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    assert.equal(posSeatPickMatchesDay({ eventDateId: null }, saturday, 2), false)
    assert.equal(
      posSeatPickMatchesDay({ eventDateId: saturday }, saturday, 2),
      true,
    )
    assert.equal(posSeatPickMatchesDay({ eventDateId: null }, friday, 1), true)
  })
})
