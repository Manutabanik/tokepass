import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  ScannerSetupError,
  classifyScannerSetupError,
} from "./scanner-setup-error"

describe("classifyScannerSetupError", () => {
  it("keeps an explicit setup error code", () => {
    const error = new ScannerSetupError(
      "auth_required",
      "Sesión expirada. Volvé a iniciar sesión.",
    )
    assert.deepEqual(classifyScannerSetupError(error), {
      code: "auth_required",
      message: "Sesión expirada. Volvé a iniciar sesión.",
    })
  })

  it("maps abort and fetch failures to timeout or network", () => {
    const abort = new Error("The operation was aborted")
    abort.name = "AbortError"
    assert.equal(classifyScannerSetupError(abort).code, "timeout")

    const fetchError = new TypeError("Failed to fetch")
    assert.equal(classifyScannerSetupError(fetchError).code, "network")
  })

  it("maps HTTP auth and forbidden wording", () => {
    assert.equal(
      classifyScannerSetupError(new Error("401 token expired")).code,
      "auth_required",
    )
    assert.equal(
      classifyScannerSetupError(new Error("403 forbidden")).code,
      "forbidden",
    )
  })
})
