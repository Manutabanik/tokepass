import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildOrderEmailTickets,
  formatOrderNumber,
  groupOrderEmailTickets,
  missingGroupSlots,
  planGroupTicketExpansion,
  ticketPassLabel,
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

describe("ticket labels for receipts", () => {
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

  it("keeps valida URLs out of the receipt payload", () => {
    const payload = ticketValidationUrl(
      "https://www.tokepass.com.ar",
      "11111111-1111-4111-8111-111111111111",
    )
    assert.equal(
      payload,
      "https://www.tokepass.com.ar/valida/11111111-1111-4111-8111-111111111111",
    )
  })

  it("formats a compact order number", () => {
    assert.equal(
      formatOrderNumber("a1b2c3d4-e5f6-7890-abcd-ef1234567890"),
      "TP-A1B2C3D4",
    )
  })

  it("maps tickets into receipt lines without QR payloads", () => {
    const rows = buildOrderEmailTickets({
      tickets: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          group_id: "g1",
          group_slot: 1,
          ticket_tiers: { name: "Mesas" },
          event_seating_units: { label: "Mesa 12", sector_name: "Living" },
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          group_id: "g1",
          group_slot: 2,
          ticket_tiers: { name: "Mesas" },
          event_seating_units: { label: "Mesa 12", sector_name: "Living" },
        },
      ],
    })
    assert.equal(rows[0]?.label, "Mesa 12 - Pase 1 de 2")
    assert.equal(rows[1]?.label, "Mesa 12 - Pase 2 de 2")
    assert.equal("qrCodeUrl" in (rows[0] ?? {}), false)
    assert.equal("codeText" in (rows[0] ?? {}), false)
  })
})

describe("groupOrderEmailTickets", () => {
  function labels(tickets: Array<{ id: string; label: string }>) {
    return groupOrderEmailTickets(tickets).map((group) => group.label)
  }

  it("colapsa una mesa de 8 pases en una sola linea", () => {
    const tickets = Array.from({ length: 8 }, (_, index) => ({
      id: `t${index + 1}`,
      label: `Mesa 13 - Pase ${index + 1} de 8`,
    }))
    assert.deepEqual(labels(tickets), ["1x Mesa 13 (8 accesos)"])
  })

  it("cuenta entradas individuales sin sufijo de pase", () => {
    const tickets = Array.from({ length: 4 }, (_, index) => ({
      id: `t${index + 1}`,
      label: "Campo General",
    }))
    assert.deepEqual(labels(tickets), ["4x Campo General"])
  })

  it("suma dos mesas del mismo nombre como 2x", () => {
    const tickets = Array.from({ length: 16 }, (_, index) => ({
      id: `t${index + 1}`,
      label: `Mesa 13 - Pase ${(index % 8) + 1} de 8`,
    }))
    assert.deepEqual(labels(tickets), ["2x Mesa 13 (8 accesos)"])
  })

  it("separa lugares distintos y preserva el orden de aparicion", () => {
    assert.deepEqual(
      labels([
        { id: "a", label: "Mesa 13 - Pase 1 de 2" },
        { id: "b", label: "Mesa 13 - Pase 2 de 2" },
        { id: "c", label: "Campo General" },
        { id: "d", label: "Mesa 14 - Pase 1 de 2" },
        { id: "e", label: "Mesa 14 - Pase 2 de 2" },
      ]),
      ["1x Mesa 13 (2 accesos)", "1x Campo General", "1x Mesa 14 (2 accesos)"],
    )
  })

  it("no pierde una mesa cuando llegan menos pases que el total", () => {
    assert.deepEqual(labels([{ id: "a", label: "Mesa 13 - Pase 1 de 8" }]), [
      "1x Mesa 13 (8 accesos)",
    ])
  })

  it("expone el desglose ademas de la etiqueta", () => {
    const [group] = groupOrderEmailTickets([
      { id: "a", label: "Mesa 13 - Pase 1 de 2" },
      { id: "b", label: "Mesa 13 - Pase 2 de 2" },
    ])
    assert.equal(group?.place, "Mesa 13")
    assert.equal(group?.units, 1)
    assert.equal(group?.accessesPerUnit, 2)
  })

  it("devuelve lista vacia sin tickets", () => {
    assert.deepEqual(groupOrderEmailTickets([]), [])
  })
})
