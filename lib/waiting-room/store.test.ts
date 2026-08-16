import assert from "node:assert/strict"
import { after, describe, it } from "node:test"

import {
  admitWaitingRoomSlot,
  getWaitingRoomSnapshot,
  releaseWaitingRoomSlot,
} from "./store"

describe("waiting-room store", () => {
  const previousCapacity = process.env.WAITING_ROOM_MAX_CAPACITY

  after(() => {
    if (previousCapacity == null) delete process.env.WAITING_ROOM_MAX_CAPACITY
    else process.env.WAITING_ROOM_MAX_CAPACITY = previousCapacity
  })

  it("admits a slot and releases it", async () => {
    process.env.WAITING_ROOM_MAX_CAPACITY = "8"
    const eventKey = `test-admit-${crypto.randomUUID()}`
    const admitted = await admitWaitingRoomSlot(eventKey, "slot-a")
    assert.equal(admitted, true)
    const snapshot = await getWaitingRoomSnapshot(eventKey)
    assert.equal(snapshot.active, 1)
    await releaseWaitingRoomSlot(eventKey, "slot-a")
    const after = await getWaitingRoomSnapshot(eventKey)
    assert.equal(after.active, 0)
  })

  it("rejects a second slot when capacity is 1", async () => {
    process.env.WAITING_ROOM_MAX_CAPACITY = "1"
    const eventKey = `test-cap-${crypto.randomUUID()}`
    assert.equal(await admitWaitingRoomSlot(eventKey, "slot-a"), true)
    assert.equal(await admitWaitingRoomSlot(eventKey, "slot-b"), false)
    const snapshot = await getWaitingRoomSnapshot(eventKey)
    assert.equal(snapshot.active, 1)
    assert.equal(snapshot.capacity, 1)
  })
})
