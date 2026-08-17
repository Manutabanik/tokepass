import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { TicketSelectorTier } from "@/components/public/ticket-tier-selector"
import {
  formatEventCartDate,
  formatEventDayNumber,
  formatEventMonthShort,
  formatEventWeekdayShort,
} from "@/lib/format"

import {
  checkoutDateCardParts,
  defaultCheckoutDateId,
  defaultCheckoutKindTab,
  isSamePriceAnyDay,
  listCheckoutDateCards,
  listCheckoutDayTabs,
  shouldShowCheckoutKindTabs,
  ticketDateCartLabel,
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

describe("progressive disclosure tabs", () => {
  const dayTicket = tier({
    id: "vie",
    name: "Viernes",
    isFullPass: false,
    dayId: "d1",
  })
  const pass = tier({ id: "abono", name: "Abono", isFullPass: true })

  it("shows kind tabs only when the event has days and passes", () => {
    assert.equal(shouldShowCheckoutKindTabs([dayTicket, pass], days), true)
    assert.equal(shouldShowCheckoutKindTabs([dayTicket], days), false)
    assert.equal(shouldShowCheckoutKindTabs([pass], days), false)
  })

  it("defaults to the days tab when day tickets exist", () => {
    assert.equal(defaultCheckoutKindTab([dayTicket, pass]), "days")
    assert.equal(defaultCheckoutKindTab([pass]), "passes")
  })

  it("preselects the first date that actually has tickets", () => {
    const cards = listCheckoutDateCards(days, [dayTicket, pass])
    assert.equal(defaultCheckoutDateId(cards, [dayTicket]), "d1")
    assert.equal(cards[0]?.weekday, formatEventWeekdayShort(days[0].start_time))
    assert.equal(cards[0]?.dayNumber, formatEventDayNumber(days[0].start_time))
    assert.equal(cards[0]?.month, formatEventMonthShort(days[0].start_time))
  })

  it("formats a calendar card from an ISO date without hardcoded labels", () => {
    const iso = "2026-11-14T20:00:00-03:00"
    const parts = checkoutDateCardParts(iso)
    assert.equal(parts.weekday, formatEventWeekdayShort(iso))
    assert.equal(parts.dayNumber, formatEventDayNumber(iso))
    assert.equal(parts.month, formatEventMonthShort(iso))
    assert.ok(parts.weekday.length > 0)
    assert.ok(parts.dayNumber.length > 0)
    assert.ok(parts.month.length > 0)
  })
})

describe("ticketDateCartLabel", () => {
  it("uses a compact weekday-day-month label for day tickets", () => {
    const dayTicket = tier({
      id: "vie",
      name: "Viernes",
      isFullPass: false,
      dayId: "d1",
    })
    assert.equal(
      ticketDateCartLabel(dayTicket, days),
      formatEventCartDate(days[0].start_time),
    )
  })

  it("labels full-pass tickets as every day", () => {
    assert.equal(
      ticketDateCartLabel(tier({ id: "abono", name: "Abono" }), days),
      "Todos los días",
    )
  })
})
