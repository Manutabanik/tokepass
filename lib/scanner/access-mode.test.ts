import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { preferredScannerAccessMode } from "@/lib/scanner/access-mode"
import { scannerCameraErrorMessage } from "@/lib/scanner/camera-error"
import {
  denegadoYaIngresoCopy,
  formatScanClock,
  permitidoCopy,
} from "@/lib/scanner/scan-copy"

describe("gate control copy and mode", () => {
  it("preselects guard on phones and totem on tablet/desktop", () => {
    assert.equal(preferredScannerAccessMode(390), "guard")
    assert.equal(preferredScannerAccessMode(767), "guard")
    assert.equal(preferredScannerAccessMode(768), "totem")
    assert.equal(preferredScannerAccessMode(1280), "totem")
  })

  it("builds permitido and denegado lines", () => {
    assert.equal(
      permitidoCopy({ ownerName: "Ana Perez", sector: "VIP" }),
      "PERMITIDO - Ana Perez (VIP)",
    )
    assert.equal(
      permitidoCopy({ ownerName: "Ana Perez", sector: null }),
      "PERMITIDO - Ana Perez",
    )
    assert.match(denegadoYaIngresoCopy("2026-08-15T22:41:00.000-03:00"), /DENEGADO - Ya ingresó a las/)
    assert.equal(denegadoYaIngresoCopy(null), "DENEGADO - Ya ingresó")
    assert.equal(formatScanClock(null), "")
  })

  it("explains camera permission denial in Spanish", () => {
    assert.match(
      scannerCameraErrorMessage({ kind: "permission-denied", message: "Permission denied" }),
      /permití el acceso a la cámara/i,
    )
    assert.match(
      scannerCameraErrorMessage({ kind: "in-use", message: "busy" }),
      /ocupada/i,
    )
  })
})
