import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildAdmissionLeaseHash,
  decideOfflineAdmission,
  filterTicketIdsForDeviceSlot,
  isGroupAdmissionTicket,
  parseScannerDeviceSlot,
  ticketBelongsToDeviceSlot,
  ticketDeviceSlot,
} from "@/lib/scanner/admission-lease"

describe("offline admission lease", () => {
  it("assigns the same ticket to a stable device slot", () => {
    const ticketId = "9dfcc6ca-8d97-4d9c-951d-ffabc21e6210"
    const slot = ticketDeviceSlot(ticketId, 4)
    assert.equal(ticketDeviceSlot(ticketId, 4), slot)
    assert.equal(ticketBelongsToDeviceSlot(ticketId, slot, 4), true)
    assert.equal(ticketBelongsToDeviceSlot(ticketId, (slot + 1) % 4, 4), false)
    assert.equal(ticketBelongsToDeviceSlot(ticketId, 0, 1), true)
    assert.equal(ticketBelongsToDeviceSlot(ticketId, 0, 0), false)
    assert.equal(ticketBelongsToDeviceSlot(ticketId, 0, Number.NaN), false)
    assert.equal(ticketDeviceSlot(ticketId, 0), -1)
  })

  it("keeps only ticket ids that belong to the configured pistol slot", () => {
    const ids = [
      "9dfcc6ca-8d97-4d9c-951d-ffabc21e6210",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    ]
    const count = 4
    const index = ticketDeviceSlot(ids[0]!, count)
    const filtered = filterTicketIdsForDeviceSlot(ids, { index, count })
    assert.equal(
      filtered.every((id) => ticketBelongsToDeviceSlot(id, index, count)),
      true,
    )
    assert.equal(filtered.includes(ids[0]!), true)
    assert.deepEqual(filterTicketIdsForDeviceSlot(ids, null), [])
    assert.deepEqual(filterTicketIdsForDeviceSlot(ids, { index: 0, count: 0 }), [])
  })

  it("does not invent a one-pistol slot from missing storage", () => {
    assert.equal(parseScannerDeviceSlot(null), null)
    assert.equal(parseScannerDeviceSlot(""), null)
    assert.equal(parseScannerDeviceSlot("{"), null)
    assert.deepEqual(parseScannerDeviceSlot(JSON.stringify({ index: 0, count: 1 })), {
      index: 0,
      count: 1,
    })
    assert.equal(parseScannerDeviceSlot(JSON.stringify({ index: 3, count: 2 })), null)
  })

  it("blocks a second local read when the lease already covers the ticket", () => {
    const decision = decideOfflineAdmission({
      status: "valid",
      admissionsUsed: 1,
      maxAdmissions: 1,
      groupId: null,
      ticketId: "ticket-a",
      deviceSlotIndex: 0,
      deviceSlotCount: 1,
      online: false,
      hasLivePeers: false,
      localLeaseCount: 1,
      scannedAt: 1_725_000_000_000,
    })
    assert.equal(decision.action, "duplicate")
    assert.equal(decision.reason, "lease_exists")
  })

  it("sends grouped tickets to main gate when several pistols are offline without peers", () => {
    assert.equal(
      isGroupAdmissionTicket({ group_id: "mesa-12", max_admissions: 1 }),
      true,
    )
    const ticketId = "ticket-group"
    const ownerSlot = ticketDeviceSlot(ticketId, 2)
    const decision = decideOfflineAdmission({
      status: "valid",
      admissionsUsed: 0,
      maxAdmissions: 4,
      groupId: "mesa-12",
      ticketId,
      deviceSlotIndex: ownerSlot,
      deviceSlotCount: 2,
      online: false,
      hasLivePeers: false,
      localLeaseCount: 0,
      scannedAt: null,
    })
    assert.equal(decision.action, "main_gate_review")
    assert.equal(decision.reason, "group_no_peers")
  })

  it("admits a grouped ticket on a single pistol with a local lease", () => {
    const decision = decideOfflineAdmission({
      status: "valid",
      admissionsUsed: 0,
      maxAdmissions: 4,
      groupId: "mesa-12",
      ticketId: "ticket-group",
      deviceSlotIndex: 0,
      deviceSlotCount: 1,
      online: false,
      hasLivePeers: false,
      localLeaseCount: 0,
      scannedAt: null,
    })
    assert.equal(decision.action, "admit")
  })

  it("rejects refunded tickets offline", () => {
    const decision = decideOfflineAdmission({
      status: "refunded",
      admissionsUsed: 0,
      maxAdmissions: 1,
      groupId: null,
      ticketId: "ticket-refunded",
      deviceSlotIndex: 0,
      deviceSlotCount: 1,
      online: false,
      hasLivePeers: false,
      localLeaseCount: 0,
      scannedAt: null,
    })
    assert.equal(decision.action, "reject")
    assert.equal(decision.reason, "invalid_status")
  })

  it("rejects tickets outside the assigned pistol range", () => {
    const ticketId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    const owner = ticketDeviceSlot(ticketId, 2)
    const other = owner === 0 ? 1 : 0
    const decision = decideOfflineAdmission({
      status: "valid",
      admissionsUsed: 0,
      maxAdmissions: 1,
      groupId: null,
      ticketId,
      deviceSlotIndex: other,
      deviceSlotCount: 2,
      online: false,
      hasLivePeers: false,
      localLeaseCount: 0,
      scannedAt: null,
    })
    assert.equal(decision.action, "main_gate_review")
    assert.equal(decision.reason, "range_mismatch")
  })

  it("does not admit offline when the pistol slot is missing or invalid", () => {
    const ticketId = "bbbbbbbb-cccc-dddd-eeee-ffffffffffff"
    const missing = decideOfflineAdmission({
      status: "valid",
      admissionsUsed: 0,
      maxAdmissions: 1,
      groupId: null,
      ticketId,
      deviceSlotIndex: 0,
      deviceSlotCount: 0,
      online: false,
      hasLivePeers: false,
      localLeaseCount: 0,
      scannedAt: null,
    })
    assert.equal(missing.action, "main_gate_review")
    assert.equal(missing.reason, "range_mismatch")
  })

  it("builds a deterministic lease hash for the same admission tuple", async () => {
    const parts = {
      deviceId: "device-1",
      ticketId: "ticket-1",
      timestamp: 1_725_000_000_000,
      admissionCounter: 1,
    }
    const first = await buildAdmissionLeaseHash(parts)
    const second = await buildAdmissionLeaseHash(parts)
    assert.equal(first, second)
    assert.equal(first.length, 64)
    const other = await buildAdmissionLeaseHash({
      ...parts,
      deviceId: "device-2",
    })
    assert.notEqual(first, other)
  })
})
