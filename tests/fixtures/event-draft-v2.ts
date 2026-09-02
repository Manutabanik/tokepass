/**
 * Fixtures del borrador de evento v2.
 *
 * Los tests armaban los line items con literales de 7 campos, asi que el tipo
 * inferido no tenia `slotId`, `validDayIds`, `dayRates` ni `ticketType`, que el
 * publish si lee. Partir de `emptyEventDraftV2LineItem()` los mantiene atados
 * al schema.
 */

import type {
  EventDraftV2ScheduleDay,
  EventDraftV2ScheduleSlot,
} from "@/lib/events/draft-schedule-slots-v2"
import {
  emptyEventDraftV2LineItem,
  type EventDraftV2LineItem,
} from "@/lib/validations/event-draft-v2"

export function draftLineItem(
  overrides: Partial<EventDraftV2LineItem> = {},
): EventDraftV2LineItem {
  return {
    ...emptyEventDraftV2LineItem(overrides.id ?? "item-0"),
    ...overrides,
  }
}

export function draftScheduleSlot(
  overrides: Partial<EventDraftV2ScheduleSlot> = {},
): EventDraftV2ScheduleSlot {
  return {
    id: "slot-1",
    startTime: "22:00",
    endTime: "04:00",
    ...overrides,
  }
}

export function draftScheduleDay(
  overrides: Partial<EventDraftV2ScheduleDay> = {},
): EventDraftV2ScheduleDay {
  return {
    id: "day-1",
    name: "Jornada 1",
    date: "2026-09-01",
    startDate: "2026-09-01T22:00",
    endDate: "2026-09-02T04:00",
    slots: [],
    ...overrides,
  }
}
