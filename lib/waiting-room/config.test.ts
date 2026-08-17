import assert from "node:assert/strict"
import { after, describe, it } from "node:test"

import { waitingRoomCapacity, waitingRoomSecret } from "./config"

describe("waiting-room capacity", () => {
  const previousCapacity = process.env.WAITING_ROOM_MAX_CAPACITY
  const previousMaxUsers = process.env.MAX_CONCURRENT_USERS

  after(() => {
    if (previousCapacity == null) delete process.env.WAITING_ROOM_MAX_CAPACITY
    else process.env.WAITING_ROOM_MAX_CAPACITY = previousCapacity
    if (previousMaxUsers == null) delete process.env.MAX_CONCURRENT_USERS
    else process.env.MAX_CONCURRENT_USERS = previousMaxUsers
  })

  it("allows 0 so a local mass-drop test can force the queue", () => {
    process.env.MAX_CONCURRENT_USERS = "0"
    assert.equal(waitingRoomCapacity(), 0)
  })

  it("reads MAX_CONCURRENT_USERS over WAITING_ROOM_MAX_CAPACITY", () => {
    process.env.WAITING_ROOM_MAX_CAPACITY = "500"
    process.env.MAX_CONCURRENT_USERS = "1"
    assert.equal(waitingRoomCapacity(), 1)
  })

  it("does not use a hardcoded development HMAC secret", () => {
    const previousSecret = process.env.WAITING_ROOM_SECRET
    const previousCron = process.env.CRON_SECRET
    delete process.env.WAITING_ROOM_SECRET
    delete process.env.CRON_SECRET
    try {
      const first = waitingRoomSecret()
      const second = waitingRoomSecret()
      assert.equal(first.length, 32)
      assert.equal(first, second)
      assert.notEqual(Buffer.from(first).toString("utf8"), "tokepass-waiting-room-dev-secret")
    } finally {
      if (previousSecret == null) delete process.env.WAITING_ROOM_SECRET
      else process.env.WAITING_ROOM_SECRET = previousSecret
      if (previousCron == null) delete process.env.CRON_SECRET
      else process.env.CRON_SECRET = previousCron
    }
  })
})
