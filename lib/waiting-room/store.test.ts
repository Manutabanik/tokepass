import assert from "node:assert/strict"
import { after, describe, it } from "node:test"

import {
  admitWaitingRoomSlot,
  getWaitingRoomSnapshot,
  releaseWaitingRoomSlot,
  tryAdmitFromQueue,
} from "./store"

describe("waiting-room store", () => {
  const previousCapacity = process.env.WAITING_ROOM_MAX_CAPACITY
  const previousMaxUsers = process.env.MAX_CONCURRENT_USERS

  after(() => {
    if (previousCapacity == null) delete process.env.WAITING_ROOM_MAX_CAPACITY
    else process.env.WAITING_ROOM_MAX_CAPACITY = previousCapacity
    if (previousMaxUsers == null) delete process.env.MAX_CONCURRENT_USERS
    else process.env.MAX_CONCURRENT_USERS = previousMaxUsers
  })

  it("admits a slot and releases it", async () => {
    delete process.env.MAX_CONCURRENT_USERS
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
    delete process.env.MAX_CONCURRENT_USERS
    process.env.WAITING_ROOM_MAX_CAPACITY = "1"
    const eventKey = `test-cap-${crypto.randomUUID()}`
    assert.equal(await admitWaitingRoomSlot(eventKey, "slot-a"), true)
    assert.equal(await admitWaitingRoomSlot(eventKey, "slot-b"), false)
    const snapshot = await getWaitingRoomSnapshot(eventKey)
    assert.equal(snapshot.active, 1)
    assert.equal(snapshot.capacity, 1)
  })

  it("never admits when MAX_CONCURRENT_USERS is 0", async () => {
    process.env.MAX_CONCURRENT_USERS = "0"
    const eventKey = `test-zero-${crypto.randomUUID()}`
    assert.equal(await admitWaitingRoomSlot(eventKey, "slot-a"), false)
    const queued = await tryAdmitFromQueue(eventKey, "waiter-a")
    assert.equal(queued.admitted, false)
    assert.equal(queued.capacity, 0)
    assert.ok(queued.position >= 1)
  })

  it("admits FIFO head when a tunnel slot frees", async () => {
    delete process.env.MAX_CONCURRENT_USERS
    process.env.WAITING_ROOM_MAX_CAPACITY = "1"
    const eventKey = `test-fifo-${crypto.randomUUID()}`

    const first = await tryAdmitFromQueue(eventKey, "q-a")
    assert.equal(first.admitted, true)
    assert.equal(first.position, 0)

    const second = await tryAdmitFromQueue(eventKey, "q-b")
    assert.equal(second.admitted, false)
    assert.equal(second.position, 1)

    await releaseWaitingRoomSlot(eventKey, "q-a")
    const promoted = await tryAdmitFromQueue(eventKey, "q-b")
    assert.equal(promoted.admitted, true)
    assert.equal(promoted.position, 0)
  })
})
