import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { TicketSelectorTier } from "@/components/public/ticket-tier-selector"

import {
  isSamePriceAnyDay,
  listCheckoutDayTabs,
  ticketMatchesTab,
} from "./ticket-day-groups"

const days = [
  {
    id: "d1",
    title: "Viernes",
    start_time: "2026-08-21T20:00:00-03:00",
    end_time: "2026-08-22T04:00:00-03:00",
  },
  {
    id: "d2",
    title: "Sabado",
    start_time: "2026-08-22T20:00:00-03:00",
    end_time: "2026-08-23T04:00:00-03:00",
  },
]

function tier(
  patch: Partial<TicketSelectorTier> & Pick<TicketSelectorTier, "id" | "name">,
): TicketSelectorTier {
  return {
    price: 10000,
    available: 10,
    isFullPass: true,
    ...patch,
  }
}

describe("listCheckoutDayTabs", () => {
  it("renders every configured day even when tickets are full-pass only", () => {
    const tabs = listCheckoutDayTabs(days, [])
    assert.deepEqual(
      tabs.map((tab) => tab.dateId),
      ["d1", "d2"],
    )
  })
})

describe("isSamePriceAnyDay", () => {
  it("is true when all tickets are full-pass on a multi-day event", () => {
    assert.equal(
      isSamePriceAnyDay([tier({ id: "a", name: "General" })], days),
      true,
    )
  })
})

describe("ticketMatchesTab", () => {
  it("shows full-pass tickets on a day tab when they apply to any day", () => {
    const pass = tier({ id: "a", name: "General", isFullPass: true })
    assert.equal(ticketMatchesTab(pass, "d1"), false)
    assert.equal(
      ticketMatchesTab(pass, "d1", { treatFullPassAsAnyDay: true }),
      true,
    )
  })
})
