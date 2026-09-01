"use client"

import { useLayoutEffect } from "react"
import { useFormContext, useWatch } from "react-hook-form"

import { nextDraftTicketAfterScheduleChange } from "@/lib/events/draft-day-priced-tickets"
import type { EventDraftV2 } from "@/lib/validations/event-draft-v2"

/**
 * Keeps `tickets[].dayRates` aligned with `schedule[]` even when the ticket
 * drawer is closed. The drawer-only sync would leave stale rates after the
 * accordion → sheet refactor.
 */
export function useSyncDraftDayRates() {
  const { getValues, setValue } = useFormContext<EventDraftV2>()
  const schedule =
    (useWatch({ name: "schedule" }) as EventDraftV2["schedule"] | undefined) ??
    []
  const scheduleKey = schedule
    .map((day) => day.id?.trim())
    .filter(Boolean)
    .join("|")

  useLayoutEffect(() => {
    const days = getValues("schedule") ?? []
    const tickets = getValues("tickets") ?? []
    const extras = getValues("extras") ?? []

    function syncLine(
      path: "tickets" | "extras",
      item: (typeof tickets)[number],
      index: number,
    ) {
      const synced = nextDraftTicketAfterScheduleChange(item, days)
      if (!synced) return
      setValue(`${path}.${index}.dayRates`, synced.dayRates, {
        shouldDirty: false,
        shouldTouch: false,
      })
      setValue(`${path}.${index}.price`, synced.price, { shouldDirty: false })
      setValue(`${path}.${index}.stock`, synced.stock, { shouldDirty: false })
    }

    tickets.forEach((ticket, index) => syncLine("tickets", ticket, index))
    extras.forEach((extra, index) => syncLine("extras", extra, index))
  }, [getValues, scheduleKey, setValue])
}
