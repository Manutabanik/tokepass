import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  createWalletDeviceId,
  isWalletDeviceId,
  isWalletDeviceMismatchError,
  normalizeWalletDeviceId,
  resolveIncomingWalletDeviceId,
  WALLET_DEVICE_MISMATCH_CODE,
  WALLET_DEVICE_MISMATCH_MESSAGE,
  WalletDeviceMismatchError,
} from "./wallet-device"

describe("wallet device id", () => {
  it("accepts a UUID and rejects garbage", () => {
    const id = createWalletDeviceId()
    assert.equal(isWalletDeviceId(id), true)
    assert.equal(normalizeWalletDeviceId(` ${id.toUpperCase()} `), id)
    assert.equal(normalizeWalletDeviceId("not-a-device"), null)
    assert.equal(normalizeWalletDeviceId(""), null)
    assert.equal(normalizeWalletDeviceId(null), null)
  })

  it("requires cookie and submitted id to match when both exist", () => {
    const a = "11111111-1111-4111-8111-111111111111"
    const b = "22222222-2222-4222-8222-222222222222"
    assert.equal(resolveIncomingWalletDeviceId(a, a), a)
    assert.equal(resolveIncomingWalletDeviceId(a, b), null)
    assert.equal(resolveIncomingWalletDeviceId(a, null), a)
    assert.equal(resolveIncomingWalletDeviceId(null, b), b)
    assert.equal(resolveIncomingWalletDeviceId("bad", b), b)
    assert.equal(resolveIncomingWalletDeviceId(null, null), null)
  })

  it("detects the mismatch error used to force logout", () => {
    assert.equal(
      isWalletDeviceMismatchError(new WalletDeviceMismatchError()),
      true,
    )
    assert.equal(
      isWalletDeviceMismatchError(new Error(WALLET_DEVICE_MISMATCH_MESSAGE)),
      true,
    )
    assert.equal(
      isWalletDeviceMismatchError(new Error(WALLET_DEVICE_MISMATCH_CODE)),
      true,
    )
    assert.equal(isWalletDeviceMismatchError(new Error("boom")), false)
    assert.equal(isWalletDeviceMismatchError("nope"), false)
  })
})
