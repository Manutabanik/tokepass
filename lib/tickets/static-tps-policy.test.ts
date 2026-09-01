import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  assertStaticAdmissionExportAllowed,
  canAcceptStaticTpsAtDoor,
  canExportStaticAdmissionArtifact,
  DigitalTicketStaticExportError,
  isLivingQrEvent,
  isPaperStaticTpsChannel,
  normalizeIssuanceChannel,
  ticketAllowsStaticAdmissionExport,
} from "./static-tps-policy"

describe("static TPS policy", () => {
  it("treats missing or unknown channels as online", () => {
    assert.equal(normalizeIssuanceChannel(null), "online")
    assert.equal(normalizeIssuanceChannel(""), "online")
    assert.equal(normalizeIssuanceChannel("web"), "online")
    assert.equal(normalizeIssuanceChannel("pos"), "pos")
  })

  it("treats any non-static event as Living QR", () => {
    assert.equal(isLivingQrEvent("static"), false)
    assert.equal(isLivingQrEvent("dynamic"), true)
    assert.equal(isLivingQrEvent(null), true)
  })

  it("blocks PDF and wallet export for online tickets on dynamic events", () => {
    assert.equal(
      canExportStaticAdmissionArtifact({
        qrType: "dynamic",
        issuanceChannel: "online",
      }),
      false,
    )
    assert.equal(
      canExportStaticAdmissionArtifact({
        qrType: "dynamic",
        issuanceChannel: null,
      }),
      false,
    )
    assert.throws(
      () =>
        assertStaticAdmissionExportAllowed({
          qrType: "dynamic",
          issuanceChannel: "online",
        }),
      DigitalTicketStaticExportError,
    )
  })

  it("allows paper channels and static events", () => {
    assert.equal(isPaperStaticTpsChannel("pos"), true)
    assert.equal(isPaperStaticTpsChannel("batch_print"), true)
    assert.equal(isPaperStaticTpsChannel("complimentary"), true)
    assert.equal(isPaperStaticTpsChannel("accreditation"), true)
    assert.equal(
      canExportStaticAdmissionArtifact({
        qrType: "dynamic",
        issuanceChannel: "pos",
      }),
      true,
    )
    assert.equal(
      canExportStaticAdmissionArtifact({
        qrType: "dynamic",
        issuanceChannel: "batch_print",
      }),
      true,
    )
    assert.equal(
      canExportStaticAdmissionArtifact({
        qrType: "static",
        issuanceChannel: "online",
      }),
      true,
    )
  })

  it("rejects TPS at the door for online Living QR tickets", () => {
    assert.equal(
      canAcceptStaticTpsAtDoor({
        qrType: "dynamic",
        issuanceChannel: "online",
      }),
      false,
    )
    assert.equal(
      canAcceptStaticTpsAtDoor({
        qrType: "dynamic",
        issuanceChannel: "pos",
      }),
      true,
    )
  })

  it("does not trust ticket.is_dynamic_qr when the event is Living QR", () => {
    assert.equal(
      ticketAllowsStaticAdmissionExport({
        qrType: "static",
        eventQrType: "dynamic",
        issuanceChannel: "online",
      }),
      false,
    )
    assert.equal(
      ticketAllowsStaticAdmissionExport({
        qrType: "static",
        eventQrType: "dynamic",
        issuanceChannel: "pos",
      }),
      true,
    )
  })
})
