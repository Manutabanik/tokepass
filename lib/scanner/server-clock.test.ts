import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  parseScannerServerTimestamp,
  scannerClockOffsetFromSample,
} from "./server-clock"

describe("scanner server clock", () => {
  it("accepts epoch milliseconds from Postgres", () => {
    assert.equal(parseScannerServerTimestamp(1_725_000_000_000), 1_725_000_000_000)
    assert.equal(parseScannerServerTimestamp("1725000000000"), 1_725_000_000_000)
    assert.equal(parseScannerServerTimestamp(1_725_000_000), null)
    assert.equal(parseScannerServerTimestamp("nope"), null)
  })

  it("stores device-minus-server so a skewed phone aligns to DB time", () => {
    const server = 1_725_000_000_000
    const device = server + 22_000
    assert.equal(scannerClockOffsetFromSample(server, device), 22_000)
    assert.equal(scannerClockOffsetFromSample("bad", device), null)
  })
})
