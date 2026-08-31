import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { shouldFallbackSandboxFinalize } from "./sandbox-finalize"

describe("shouldFallbackSandboxFinalize", () => {
  it("retries when the sandbox provider is not in the enum", () => {
    assert.equal(
      shouldFallbackSandboxFinalize({ code: "invalid_provider" }),
      true,
    )
  })

  it("retries when the RPC is missing from schema cache", () => {
    assert.equal(
      shouldFallbackSandboxFinalize({
        errorMessage: "Could not find the function public.finalize_sandbox_paid_order",
      }),
      true,
    )
  })

  it("does not retry a real finalize rejection", () => {
    assert.equal(
      shouldFallbackSandboxFinalize({ code: "no_tickets" }),
      false,
    )
  })
})
