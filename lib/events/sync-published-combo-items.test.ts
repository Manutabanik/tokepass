import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  comboSchedulesFromPublishedTickets,
  syncPublishedComboItems,
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

  it("binds a combo even if the live ticket_type is still the column default", async () => {
    const dayA = "550e8400-e29b-41d4-a716-446655440001"
    const dayB = "550e8400-e29b-41d4-a716-446655440002"
    // Un array evita que el control flow narrowee la variable a null: el
    // assign pasa dentro del callback y TS no lo ve.
    const synced: Array<{ p_combo_tier_id: string; p_schedule_ids: string[] }> =
      []
    const result = await syncPublishedComboItems({
      db: {
        from: () => ({
          select: () => ({
            eq: async () => ({
              data: [
                {
                  id: "tier-1",
                  name: "Pack 2 días",
                  ticket_type: "standard",
                },
              ],
              error: null,
            }),
          }),
        }),
        rpc: async (_fn, args) => {
          synced.push(args)
          return { error: null }
        },
      },
      eventId: "evt",
      tickets: [
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
          tier_type: "general",
          category: "standard",
          layout_type: "general",
          seating_sector_id: null,
          day_id: null,
          ticket_type: "combo",
          combo_schedule_ids: [dayA, dayB],
        },
      ],
    })
    assert.equal(result.ok, true)
    assert.equal(synced[0]?.p_combo_tier_id, "tier-1")
    assert.deepEqual(synced[0]?.p_schedule_ids, [dayA, dayB])
  })
})
