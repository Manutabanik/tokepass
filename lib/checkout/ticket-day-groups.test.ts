import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { TicketSelectorTier } from "@/components/public/ticket-tier-selector"
import {
  formatEventCartDate,
  formatEventCartDateLong,
  formatEventDay,
  formatEventDayNumber,
  formatEventMonthShort,
  formatEventWeekdayShort,
} from "@/lib/format"

import {
  checkoutDateCardParts,
  defaultCheckoutDateId,
  defaultCheckoutKindTab,
  FULL_PASS_TAB_ID,
  groupTicketsByDate,
  isSamePriceAnyDay,
  listCheckoutDateCards,
  listCheckoutDayTabs,
  shouldShowCheckoutKindTabs,
  ticketDateCartLabel,
  ticketDateSectionLabel,
  ticketDayBadgeLabel,
  ticketMatchesTab,
  ticketVisibleOnCheckoutDay,
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
  it("hides days that have no day-specific tickets", () => {
    const tabs = listCheckoutDayTabs(days, [
      tier({ id: "vie", name: "Viernes", isFullPass: false, dayId: "d1" }),
      tier({ id: "abono", name: "Abono", isFullPass: true }),
    ])
    assert.deepEqual(
      tabs.map((tab) => tab.dateId),
      ["d1"],
    )
  })

  it("hides every day tab when only combos or full-pass tickets exist", () => {
    const tabs = listCheckoutDayTabs(days, [
      tier({ id: "abono", name: "Abono", isFullPass: true }),
    ])
    assert.deepEqual(tabs, [])
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

describe("ticketVisibleOnCheckoutDay", () => {
  it("shows only tickets whose validDayIds include the selected jornada", () => {
    const friday = tier({
      id: "vie",
      name: "Viernes",
      isFullPass: false,
      dayId: "d1",
      validDayIds: ["d1"],
    })
    const saturday = tier({
      id: "sab",
      name: "Sabado",
      isFullPass: false,
      dayId: "d2",
      validDayIds: ["d2"],
    })
    const unbound = tier({
      id: "gen",
      name: "General",
      isFullPass: false,
      dayId: null,
      validDayIds: [],
      tierType: "general",
    })
    const pass = tier({ id: "abono", name: "Abono", isFullPass: true })
    assert.equal(ticketVisibleOnCheckoutDay(friday, "d2", days), false)
    assert.equal(ticketVisibleOnCheckoutDay(saturday, "d2", days), true)
    assert.equal(ticketVisibleOnCheckoutDay(unbound, "d2", days), false)
    assert.equal(ticketVisibleOnCheckoutDay(unbound, "d1", [days[0]!]), true)
    assert.equal(ticketVisibleOnCheckoutDay(pass, "d2", days), false)
    const stale = tier({
      id: "stale",
      name: "General",
      isFullPass: false,
      dayId: "draft-day-old",
      tierType: "general",
    })
    assert.equal(ticketVisibleOnCheckoutDay(stale, "d2", days), false)
  })
})

describe("ticketMatchesTab", () => {
  it("keeps full-pass and combo tickets off day tabs unless explicitly allowed", () => {
    const pass = tier({ id: "a", name: "General", isFullPass: true })
    const combo = tier({
      id: "pack",
      name: "Pack",
      isFullPass: false,
      dayId: "d1",
      tierType: "bundle",
    })
    assert.equal(ticketMatchesTab(pass, "d1"), false)
    assert.equal(ticketMatchesTab(combo, "d1"), false)
    assert.equal(ticketMatchesTab(combo, FULL_PASS_TAB_ID), true)
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
    const combo = tier({
      id: "pack",
      name: "Pack",
      isFullPass: false,
      dayId: "d1",
      tierType: "bundle",
    })
    assert.equal(shouldShowCheckoutKindTabs([dayTicket, pass], days), true)
    assert.equal(shouldShowCheckoutKindTabs([dayTicket, combo], days), true)
    assert.equal(shouldShowCheckoutKindTabs([dayTicket], days), false)
    assert.equal(shouldShowCheckoutKindTabs([pass], days), false)
  })

  it("defaults to the days tab when day tickets exist", () => {
    assert.equal(defaultCheckoutKindTab([dayTicket, pass]), "days")
    assert.equal(defaultCheckoutKindTab([pass]), "passes")
    assert.equal(
      defaultCheckoutKindTab([
        tier({
          id: "gen",
          name: "General",
          isFullPass: false,
          dayId: null,
          tierType: "general",
        }),
      ]),
      "days",
    )
  })

  it("hides Combos y Promos when the event has no combo or pass offers", () => {
    assert.equal(
      shouldShowCheckoutKindTabs(
        [
          tier({
            id: "gen",
            name: "General",
            isFullPass: false,
            dayId: "d1",
            tierType: "general",
          }),
        ],
        days,
      ),
      false,
    )
  })

  it("preselects the first date that actually has tickets", () => {
    const cards = listCheckoutDateCards(days, [dayTicket, pass])
    assert.equal(defaultCheckoutDateId(cards, [dayTicket]), "d1")
    assert.deepEqual(
      cards.map((card) => card.dateId),
      ["d1", "d2"],
    )
    assert.equal(cards[0]?.weekday, formatEventWeekdayShort(days[0].start_time))
    assert.equal(cards[0]?.dayNumber, formatEventDayNumber(days[0].start_time))
    assert.equal(cards[0]?.month, formatEventMonthShort(days[0].start_time))
  })

  it("lists every schedule day even when a jornada still has no SKUs", () => {
    const cards = listCheckoutDateCards(days, [dayTicket])
    assert.deepEqual(
      cards.map((card) => card.dateId),
      ["d1", "d2"],
    )
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

describe("groupTicketsByDate", () => {
  it("keeps unbound single-day tickets visible when there are no date cards", () => {
    const grouped = groupTicketsByDate(
      [
        tier({
          id: "gen",
          name: "General",
          isFullPass: false,
          dayId: null,
          tierType: "general",
        }),
      ],
      [],
    )
    assert.equal(grouped.ticketsByDate.length, 1)
    assert.equal(grouped.ticketsByDate[0]?.tickets[0]?.id, "gen")
  })
})

describe("ticketDateCartLabel", () => {
  it("uses a long weekday-day-month label for day tickets", () => {
    const dayTicket = tier({
      id: "vie",
      name: "Viernes",
      isFullPass: false,
      dayId: "d1",
    })
    assert.equal(
      ticketDateCartLabel(dayTicket, days),
      formatEventCartDateLong(days[0].start_time),
    )
  })

  it("labels full-pass tickets as every day", () => {
    assert.equal(
      ticketDateCartLabel(tier({ id: "abono", name: "Abono" }), days),
      "Todos los días",
    )
  })
})

describe("ticket day visibility labels", () => {
  const dayTicket = tier({
    id: "vie",
    name: "General",
    isFullPass: false,
    dayId: "d1",
  })

  it("uses the calendar date for section headers", () => {
    assert.equal(
      ticketDateSectionLabel("d1", days),
      formatEventDay(days[0].start_time),
    )
  })

  it("shows a compact date badge on day-specific tickets", () => {
    assert.equal(
      ticketDayBadgeLabel(dayTicket, days),
      formatEventCartDate(days[0].start_time),
    )
    assert.equal(
      ticketDayBadgeLabel(tier({ id: "abono", name: "Abono" }), days),
      "Todos los días",
    )
    assert.equal(
      ticketDayBadgeLabel(tier({ id: "one", name: "General" }), [days[0]]),
      null,
    )
  })
})
