import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  compareLockKey,
  sortLockKeys,
  sortReserveRpcItems,
} from "./lock-order"

describe("lock-order", () => {
  it("sorts seat ids in a stable lexicographic order", () => {
    assert.deepEqual(
      sortLockKeys([
        "ffffffff-ffff-4fff-8fff-ffffffffffff",
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "  ",
        null,
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      ]),
      [
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        "ffffffff-ffff-4fff-8fff-ffffffffffff",
      ],
    )
  })

  it("locks numbered seats before general-admission rows", () => {
    const sorted = sortReserveRpcItems([
      { ticket_tier_id: "t2", seat_id: null },
      { ticket_tier_id: "t1", seating_unit_id: "s2" },
      { ticket_tier_id: "t9", seating_unit_id: "s1" },
    ])
    assert.equal(sorted[0]?.seating_unit_id, "s1")
    assert.equal(sorted[1]?.seating_unit_id, "s2")
    assert.equal(sorted[2]?.ticket_tier_id, "t2")
  })

  it("uses the same comparator for concurrent callers", () => {
    assert.equal(
      compareLockKey("seat-b", "seat-a") > 0,
      compareLockKey("seat-a", "seat-b") < 0,
    )
  })
})
