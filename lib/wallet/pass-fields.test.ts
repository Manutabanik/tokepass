import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { MyTicket } from "@/app/actions/tickets"
import {
  buildApplePassJson,
  buildGoogleWalletResources,
  buildWalletPassFields,
  walletBarcodeValue,
  walletGoogleId,
} from "@/lib/wallet/pass-fields"
import { decodeCertEnv } from "@/lib/wallet/pem"

function sampleTicket(overrides: Partial<MyTicket> = {}): MyTicket {
  return {
    id: "9dfcc6ca-8d97-4d9c-951d-ffabc21e6210",
    status: "valid",
    visualStatus: "active",
    qrCode: "qr-code-value",
    totpSecret: "a".repeat(48),
    deliveryMode: "PRESENCIAL",
    accessLink: null,
    transferCount: 0,
    maxTransfersAllowed: 1,
    createdAt: "2026-08-01T12:00:00.000Z",
    tierName: "VIP",
    bonusReward: null,
    dayId: null,
    dayValidityLabel: null,
    seatingLabel: "Mesa 12",
    seatingSectorName: "Mesa reservada",
    seatingRowLabel: null,
    seatingLayoutType: "table_combo",
    maxAdmissions: 1,
    admissionsUsed: 0,
    eventId: "11111111-2222-4333-8444-555555555555",
    eventTitle: "Noche Neon",
    eventDate: "2026-08-20T22:00:00.000Z",
    endsAt: "2026-08-21T06:00:00.000Z",
    doorsOpenAt: "2026-08-20T22:00:00.000Z",
    eventLocation: "Niceto, Palermo",
    flyerUrl: "https://cdn.example.com/flyer.png",
    socialShareImageUrl: null,
    organizerName: "Club TokePass",
    organizerAvatarUrl: null,
    venueName: "Niceto Club",
    qrType: "dynamic",
    eventQrType: "dynamic",
    issuanceChannel: "pos",
    holderName: "Ana Perez",
    holderDni: "30111222",
    isTest: false,
    tierPrice: 25000,
    isSponsoredByTokePass: false,
    activeResaleListingId: null,
    pendingTransfer: null,
    ...overrides,
  }
}

describe("wallet pass fields", () => {
  it("signs the wallet barcode instead of embedding the totp secret", () => {
    const secret = "b".repeat(32)
    const ticket = sampleTicket({ totpSecret: secret })
    const barcode = walletBarcodeValue(ticket)
    assert.equal(barcode.includes(secret), false)
    assert.equal(barcode.startsWith("TPS."), true)
    assert.equal(barcode.split(".")[1], ticket.id)
  })

  it("falls back to qrCode then ticket id", () => {
    assert.equal(
      walletBarcodeValue(sampleTicket({ totpSecret: "", qrCode: "paper-secret" })),
      "paper-secret",
    )
    assert.equal(
      walletBarcodeValue(sampleTicket({ totpSecret: "", qrCode: "", id: "ticket-id" })),
      "ticket-id",
    )
  })

  it("refuses to build a wallet pass for an online Living QR ticket", () => {
    assert.throws(
      () =>
        buildWalletPassFields(
          sampleTicket({
            qrType: "static",
            eventQrType: "dynamic",
            issuanceChannel: "online",
          }),
        ),
      /solo son accesibles desde la app/,
    )
  })

  it("builds a dark neon Apple pass with flyer metadata and QR", () => {
    const fields = buildWalletPassFields(sampleTicket())
    const pass = buildApplePassJson(fields, {
      passTypeIdentifier: "pass.com.tokepass.ticket",
      teamIdentifier: "TEAM123",
    })

    assert.equal(pass.backgroundColor, "rgb(9, 0, 20)")
    assert.equal(pass.labelColor, "rgb(232, 121, 249)")
    assert.equal(pass.eventTicket.primaryFields[0]?.value, "Noche Neon")
    assert.equal(pass.eventTicket.secondaryFields[0]?.value, "Ana Perez")
    assert.equal(pass.barcodes[0]?.format, "PKBarcodeFormatQR")
    assert.equal(pass.barcodes[0]?.message?.startsWith("TPS."), true)
    assert.equal(pass.barcodes[0]?.message?.includes("a".repeat(48)), false)
    assert.match(pass.eventTicket.auxiliaryFields[0]?.value ?? "", /Niceto/)
  })

  it("builds Google Wallet class and object ids without illegal characters", () => {
    const fields = buildWalletPassFields(sampleTicket())
    const resources = buildGoogleWalletResources(fields, "338800000000", null)
    assert.equal(walletGoogleId("338800000000", "ticket id"), "338800000000.ticket_id")
    assert.equal(resources.eventTicketObject.barcode.type, "QR_CODE")
    assert.equal(resources.eventTicketObject.ticketHolderName, "Ana Perez")
    assert.equal(resources.eventTicketClass.hexBackgroundColor, "#090014")
    assert.equal(resources.eventTicketClass.heroImage?.sourceUri.uri, fields.flyerUrl)
  })

  it("decodes PEM env values with escaped newlines or base64", () => {
    const pem = "-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----"
    assert.equal(decodeCertEnv(pem)?.toString("utf8"), pem)
    assert.equal(
      decodeCertEnv("-----BEGIN CERTIFICATE-----\\nABC\\n-----END CERTIFICATE-----")?.toString("utf8"),
      pem,
    )
    assert.equal(decodeCertEnv(Buffer.from(pem, "utf8").toString("base64"))?.toString("utf8"), pem)
  })
})
