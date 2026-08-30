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

    tickets.forEach((ticket, index) => {
      const synced = nextDraftTicketAfterScheduleChange(ticket, days)
      if (!synced) return
      setValue(`tickets.${index}.dayRates`, synced.dayRates, {
        shouldDirty: false,
        shouldTouch: false,
      })
      setValue(`tickets.${index}.price`, synced.price, { shouldDirty: false })
      setValue(`tickets.${index}.stock`, synced.stock, { shouldDirty: false })
    })
  }, [getValues, scheduleKey, setValue])
}
