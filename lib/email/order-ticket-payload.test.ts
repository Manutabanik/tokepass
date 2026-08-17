import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildOrderEmailTickets,
  formatOrderNumber,
  missingGroupSlots,
  planGroupTicketExpansion,
  ticketCodeText,
  ticketPassLabel,
  ticketQrImageUrl,
  ticketValidationUrl,
} from "./order-ticket-payload"

describe("planGroupTicketExpansion", () => {
  it("splits a table with 4 admissions into 3 extra slots", () => {
    const plans = planGroupTicketExpansion([
      { id: "parent", max_admissions: 4, group_id: null },
      { id: "single", max_admissions: 1, group_id: null },
    ])
    assert.equal(plans.length, 1)
    assert.equal(plans[0]?.parentId, "parent")
    assert.equal(plans[0]?.total, 4)
    assert.deepEqual(plans[0]?.extraSlots, [2, 3, 4])
    assert.ok(plans[0]?.groupId)
  })

  it("does not recreate slots that already exist in the group", () => {
    assert.deepEqual(missingGroupSlots(4, [1, 2, 3, 4]), [])
    assert.deepEqual(missingGroupSlots(4, [1]), [2, 3, 4])
  })
})

describe("ticket labels and QR urls", () => {
  it("labels grouped passes as Pase N de M", () => {
    assert.equal(
      ticketPassLabel({
        seatingLabel: "Mesa 12",
        groupSlot: 1,
        groupSize: 4,
      }),
      "Mesa 12 - Pase 1 de 4",
    )
  })

  it("builds a valida URL and qrserver image", () => {
    const payload = ticketValidationUrl(
      "https://www.tokepass.com.ar",
      "11111111-1111-4111-8111-111111111111",
    )
    assert.equal(
      payload,
      "https://www.tokepass.com.ar/valida/11111111-1111-4111-8111-111111111111",
    )
    assert.match(ticketQrImageUrl(payload), /api\.qrserver\.com/)
    assert.match(ticketQrImageUrl(payload), /data=/)
  })

  it("formats a compact order number and code", () => {
    assert.equal(
      formatOrderNumber("a1b2c3d4-e5f6-7890-abcd-ef1234567890"),
      "TP-A1B2C3D4",
    )
    assert.equal(
      ticketCodeText("abcd-ef12-3456", "ignored"),
      "ABCDEF12",
    )
  })

  it("maps tickets into email rows with group labels", () => {
    const rows = buildOrderEmailTickets({
      appUrl: "https://www.tokepass.com.ar",
      tickets: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          qr_code: "aaaa-bbbb-cccc",
          group_id: "g1",
          group_slot: 1,
          ticket_tiers: { name: "Mesas" },
          event_seating_units: { label: "Mesa 12", sector_name: "Living" },
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          qr_code: "dddd-eeee-ffff",
          group_id: "g1",
          group_slot: 2,
          ticket_tiers: { name: "Mesas" },
          event_seating_units: { label: "Mesa 12", sector_name: "Living" },
        },
      ],
    })
    assert.equal(rows[0]?.label, "Mesa 12 - Pase 1 de 2")
    assert.equal(rows[1]?.label, "Mesa 12 - Pase 2 de 2")
    assert.equal(rows[0]?.codeText, "AAAABBBB")
  })
})
