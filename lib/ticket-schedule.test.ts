import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { MyTicket } from "@/app/actions/tickets"
import { countActiveTickets, splitTicketsBySchedule } from "./ticket-schedule"

function ticket(overrides: Partial<MyTicket> & Pick<MyTicket, "id" | "eventDate">): MyTicket {
  return {
    status: "valid",
    visualStatus: "active",
    qrCode: null,
    totpSecret: null,
    deliveryMode: "PRESENCIAL",
    accessLink: null,
    transferCount: 0,
    maxTransfersAllowed: 1,
    createdAt: "2026-08-01T12:00:00.000Z",
    tierName: "General",
    bonusReward: null,
    dayId: null,
    dayValidityLabel: null,
    seatingLabel: null,
    seatingSectorName: null,
    seatingRowLabel: null,
    seatingLayoutType: null,
    maxAdmissions: 1,
    admissionsUsed: 0,
    eventId: "event-1",
    eventTitle: "Show",
    endsAt: null,
    doorsOpenAt: overrides.eventDate,
    eventLocation: null,
    flyerUrl: null,
    socialShareImageUrl: null,
    organizerName: null,
    organizerAvatarUrl: null,
    venueName: null,
    qrType: "dynamic",
    eventQrType: "dynamic",
    issuanceChannel: "online",
    holderName: "Ana",
    holderDni: null,
    isTest: false,
    tierPrice: 1000,
    ticketType: "standard",
    tierType: "general",
    isSponsoredByTokePass: false,
    activeResaleListingId: null,
    pendingTransfer: null,
    ...overrides,
  }
}

describe("splitTicketsBySchedule", () => {
  it("keeps extras out of Entradas and Pasados", () => {
    const extra = ticket({
      id: "extra-1",
      eventDate: "2099-01-01T00:00:00.000Z",
      ticketType: "extra",
      tierType: "addon",
      tierName: "Cerveza",
    })
    const addon = ticket({
      id: "addon-1",
      eventDate: "2099-01-01T00:00:00.000Z",
      ticketType: "standard",
      tierType: "addon",
      tierName: "Estacionamiento",
    })
    const admission = ticket({
      id: "adm-1",
      eventDate: "2099-01-01T00:00:00.000Z",
    })
    const { upcoming, past } = splitTicketsBySchedule([extra, addon, admission])
    assert.deepEqual(
      upcoming.map((item) => item.id),
      ["adm-1"],
    )
    assert.equal(past.length, 0)
    assert.equal(countActiveTickets([extra, addon, admission]), 1)
  })
})
