import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { evaluateOfflineManifestGate } from "@/lib/scanner/offline-manifest-gate"

const days = [
  {
    id: "day-1",
    title: "Viernes",
    start_time: "2026-08-21T22:00:00.000Z",
    end_time: "2026-08-22T06:00:00.000Z",
  },
  {
    id: "day-2",
    title: "Sabado",
    start_time: "2026-08-22T22:00:00.000Z",
    end_time: "2026-08-23T06:00:00.000Z",
  },
]

describe("evaluateOfflineManifestGate", () => {
  it("bloquea un ticket con transferencia pendiente", () => {
    const result = evaluateOfflineManifestGate({
      pendingTransfer: true,
      dayId: "day-1",
      scheduleDays: days,
      now: new Date("2026-08-21T23:00:00.000Z"),
    })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.reason, "transfer_pending")
  })

  it("bloquea un ticket fuera de la jornada vinculada", () => {
    const result = evaluateOfflineManifestGate({
      pendingTransfer: false,
      dayId: "day-1",
      scheduleDays: days,
      now: new Date("2026-08-22T23:00:00.000Z"),
    })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.reason, "wrong_schedule")
  })

  it("bloquea un ticket publicado en reventa", () => {
    const result = evaluateOfflineManifestGate({
      pendingTransfer: false,
      listedForResale: true,
      dayId: "day-1",
      scheduleDays: days,
      now: new Date("2026-08-21T23:00:00.000Z"),
    })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.reason, "listed_for_resale")
  })

  it("admite un ticket de la jornada en curso", () => {
    const result = evaluateOfflineManifestGate({
      pendingTransfer: false,
      dayId: "day-1",
      scheduleDays: days,
      now: new Date("2026-08-21T23:30:00.000Z"),
    })
    assert.equal(result.ok, true)
  })
})
