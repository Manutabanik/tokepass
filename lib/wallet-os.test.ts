import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { detectWalletSaveTarget, resolveWalletSaveTarget } from "@/lib/wallet-os"

describe("wallet OS detection", () => {
  it("picks Apple on iPhone and iPadOS", () => {
    assert.equal(
      detectWalletSaveTarget("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)"),
      "apple",
    )
    assert.equal(
      detectWalletSaveTarget("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", 5),
      "apple",
    )
  })

  it("picks Google on Android", () => {
    assert.equal(
      detectWalletSaveTarget("Mozilla/5.0 (Linux; Android 14; Pixel 8)"),
      "google",
    )
  })

  it("falls back to PDF on desktop or missing keys", () => {
    assert.equal(
      detectWalletSaveTarget("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"),
      "pdf",
    )
    assert.equal(
      resolveWalletSaveTarget({
        appleWalletEnabled: false,
        googleWalletEnabled: true,
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)",
      }),
      "pdf",
    )
    assert.equal(
      resolveWalletSaveTarget({
        appleWalletEnabled: true,
        googleWalletEnabled: false,
        userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8)",
      }),
      "pdf",
    )
  })
})
