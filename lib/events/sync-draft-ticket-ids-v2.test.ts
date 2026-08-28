import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { rematchDraftTicketIds } from "./sync-draft-ticket-ids-v2"
import { asPublishScheduleId } from "@/lib/events/publish-event-v2"
import { emptyEventDraftV2LineItem } from "@/lib/validations/event-draft-v2"

const liveId = "550e8400-e29b-41d4-a716-446655440099"
const dayId = "550e8400-e29b-41d4-a716-446655440010"

describe("rematchDraftTicketIds", () => {
  it("replaces map stub ids with the live ticket uuid", () => {
    const draft = [
      {
        ...emptyEventDraftV2LineItem(`map:${dayId}:vip`),
        name: "Mesa VIP",
        source: "map",
        sectorId: "vip",
        slotId: dayId,
        validDayIds: [dayId],
      },
    ]
    const rematched = rematchDraftTicketIds(draft, [
      {
        id: liveId,
        name: "Mesa VIP",
        seating_sector_id: "vip",
        day_id: dayId,
        tier_type: "seated",
      },
    ])
    assert.equal(rematched[0]?.id, liveId)
  })

  it("keeps an already live uuid", () => {
    const draft = [
      {
        ...emptyEventDraftV2LineItem(liveId),
        name: "General",
        source: "general",
      },
    ]
    const rematched = rematchDraftTicketIds(draft, [
      {
        id: liveId,
        name: "General",
        seating_sector_id: null,
        day_id: null,
        tier_type: "general",
      },
    ])
    assert.equal(rematched[0]?.id, liveId)
  })

  it("matches a general ticket by name when the draft still has a stub id", () => {
    const draft = [
      {
        ...emptyEventDraftV2LineItem("item-ga"),
        name: "Campo",
        source: "general",
      },
    ]
    const rematched = rematchDraftTicketIds(draft, [
      {
        id: liveId,
        name: "Campo",
        seating_sector_id: null,
        day_id: null,
        tier_type: "general",
      },
    ])
    assert.equal(rematched[0]?.id, liveId)
  })

  it("does not bind a general ticket to an extra with the same name", () => {
    const extraId = "550e8400-e29b-41d4-a716-446655440088"
    const rematched = rematchDraftTicketIds(
      [
        {
          ...emptyEventDraftV2LineItem("item-ga"),
          name: "Parking",
          source: "general",
        },
      ],
      [
        {
          id: extraId,
          name: "Parking",
          seating_sector_id: null,
          day_id: null,
          ticket_type: "extra",
          tier_type: "addon",
        },
      ],
      "ticket",
    )
    assert.equal(rematched[0]?.id, "item-ga")
  })

  it("does not bind a map ticket to the same sector on another day", () => {
    const otherDay = "550e8400-e29b-41d4-a716-446655440011"
    const stubId = `map:${dayId}:vip`
    const rematched = rematchDraftTicketIds(
      [
        {
          ...emptyEventDraftV2LineItem(stubId),
          name: "Mesa VIP",
          source: "map",
          sectorId: "vip",
          slotId: dayId,
          validDayIds: [dayId],
        },
      ],
      [
        {
          id: liveId,
          name: "Mesa VIP",
          seating_sector_id: "vip",
          day_id: otherDay,
          tier_type: "seated",
        },
      ],
    )
    assert.equal(rematched[0]?.id, stubId)
  })

  it("matches a slot-* draft day to the hashed live schedule uuid", () => {
    const publishedDay = asPublishScheduleId("slot-manana")
    assert.ok(publishedDay)
    const rematched = rematchDraftTicketIds(
      [
        {
          ...emptyEventDraftV2LineItem("map:slot-manana:vip"),
          name: "Mesa VIP",
          source: "map",
          sectorId: "vip",
          slotId: "slot-manana",
          validDayIds: ["slot-manana"],
        },
      ],
      [
        {
          id: liveId,
          name: "Mesa VIP",
          seating_sector_id: "vip",
          day_id: publishedDay,
          tier_type: "seated",
        },
      ],
    )
    assert.equal(rematched[0]?.id, liveId)
  })

  it("rematches dayRates of a visual multi-day general without rewriting the card", () => {
    const fridayLive = "550e8400-e29b-41d4-a716-446655440021"
    const saturdayLive = "550e8400-e29b-41d4-a716-446655440022"
    const rematched = rematchDraftTicketIds(
      [
        {
          ...emptyEventDraftV2LineItem("visual-general"),
          name: "General",
          source: "general",
          dayRates: [
            { dayId, price: 20000, stock: 100, ticketId: "" },
            {
              dayId: "550e8400-e29b-41d4-a716-446655440011",
              price: 30000,
              stock: 80,
              ticketId: "",
            },
          ],
        },
      ],
      [
        {
          id: fridayLive,
          name: "General Viernes",
          seating_sector_id: null,
          day_id: dayId,
          tier_type: "general",
        },
        {
          id: saturdayLive,
          name: "General Sábado",
          seating_sector_id: null,
          day_id: "550e8400-e29b-41d4-a716-446655440011",
          tier_type: "general",
        },
      ],
    )
    assert.equal(rematched[0]?.dayRates[0]?.ticketId, fridayLive)
    assert.equal(rematched[0]?.dayRates[1]?.ticketId, saturdayLive)
    assert.equal(rematched[0]?.id, fridayLive)
  })
})
