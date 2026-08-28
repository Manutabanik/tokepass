import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  comboSchedulesFromPublishedTickets,
  ticketsWithoutComboScheduleIds,
} from "./sync-published-combo-items"

describe("published combo items", () => {
  it("keeps multi-day combo schedules and strips them from the RPC row", () => {
    const dayA = "550e8400-e29b-41d4-a716-446655440001"
    const dayB = "550e8400-e29b-41d4-a716-446655440002"
    const tickets = [
      {
        id: "combo-1",
        name: "Pack 2 días",
        description: null,
        price: 20000,
        base_price: 18000,
        platform_fee: 2000,
        capacity: 40,
        min_purchase_limit: 1,
        max_purchase_limit: null,
        tier_type: "general" as const,
        category: "standard" as const,
        layout_type: "general" as const,
        seating_sector_id: null,
        day_id: null,
        ticket_type: "combo" as const,
        combo_schedule_ids: [dayA, dayB, dayA],
      },
    ]
    assert.deepEqual(comboSchedulesFromPublishedTickets(tickets), [
      { name: "Pack 2 días", scheduleIds: [dayA, dayB] },
    ])
    assert.equal(
      "combo_schedule_ids" in ticketsWithoutComboScheduleIds(tickets)[0]!,
      false,
    )
  })
})
