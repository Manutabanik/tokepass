import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  COMBO_PACKS_TAB_ID,
  comboHoldScheduleIds,
  comboScheduleIdsFromTier,
  isComboPackOffer,
  isComboPacksTabId,
} from "./combo-schedule"

const days = [
  {
    id: "550e8400-e29b-41d4-a716-446655440001",
    title: "Viernes",
    start_time: "2026-08-21T20:00:00-03:00",
    end_time: "2026-08-22T04:00:00-03:00",
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440002",
    title: "Sabado",
    start_time: "2026-08-22T20:00:00-03:00",
    end_time: "2026-08-23T04:00:00-03:00",
  },
]

describe("combo pack tab", () => {
  it("treats combo_packs as a virtual tab, not a jornada", () => {
    assert.equal(isComboPacksTabId(COMBO_PACKS_TAB_ID), true)
    assert.equal(isComboPacksTabId(days[0]!.id), false)
  })
})

describe("isComboPackOffer", () => {
  it("detects explicit combo SKUs and multi-schedule packs", () => {
    assert.equal(isComboPackOffer({ ticketType: "combo" }), true)
    assert.equal(
      isComboPackOffer({
        ticketType: "standard",
        comboScheduleIds: [days[0]!.id, days[1]!.id],
      }),
      true,
    )
    assert.equal(
      isComboPackOffer({ ticketType: "standard", dayId: days[0]!.id }),
      false,
    )
  })
})

describe("comboScheduleIdsFromTier", () => {
  it("prefers persisted combo days, then validDayIds, then all jornadas", () => {
    assert.deepEqual(
      comboScheduleIdsFromTier({
        ticketType: "combo",
        comboScheduleIds: [days[1]!.id, days[0]!.id, days[1]!.id],
      }),
      [days[1]!.id, days[0]!.id],
    )
    assert.deepEqual(
      comboScheduleIdsFromTier({
        ticketType: "combo",
        validDayIds: [days[0]!.id, days[1]!.id],
      }),
      [days[0]!.id, days[1]!.id],
    )
    assert.deepEqual(
      comboScheduleIdsFromTier({ ticketType: "combo" }, days),
      [days[0]!.id, days[1]!.id],
    )
  })
})

describe("comboHoldScheduleIds", () => {
  it("holds every jornada of a map combo", () => {
    assert.deepEqual(
      comboHoldScheduleIds(
        {
          ticketType: "combo",
          comboScheduleIds: [days[0]!.id, days[1]!.id],
        },
        days,
        days[0]!.id,
      ),
      [days[0]!.id, days[1]!.id],
    )
  })
})
