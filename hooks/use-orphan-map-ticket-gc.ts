"use client"

import { useEffect } from "react"
import { useFormContext, useWatch } from "react-hook-form"

import {
  collectDraftLiveSectorIds,
  draftHasActiveSeatingMap,
  garbageCollectDraftTickets,
  isOrphanMapTicket,
} from "@/lib/events/draft-seating-map-v2"
import type { EventDraftV2 } from "@/lib/validations/event-draft-v2"

export function useOrphanMapTicketGarbageCollector() {
  const { getValues, setValue } = useFormContext<EventDraftV2>()
  const tickets = useWatch({ name: "tickets" })
  const seatingMaps = useWatch({ name: "seatingMaps" })
  const seatingMap = useWatch({ name: "seatingMap" })

  useEffect(() => {
    const current = getValues("tickets") ?? []
    const seatingMapsValue = getValues("seatingMaps")
    const seatingMapValue = getValues("seatingMap")
    const live = draftHasActiveSeatingMap({
      seatingMaps: seatingMapsValue,
      seatingMap: seatingMapValue,
    })
      ? collectDraftLiveSectorIds({
          seatingMaps: seatingMapsValue,
          seatingMap: seatingMapValue,
        })
      : new Set<string>()
    if (!current.some((ticket) => isOrphanMapTicket(ticket, live))) return
    setValue("tickets", garbageCollectDraftTickets(current, live), {
      shouldDirty: true,
      shouldTouch: true,
    })
  }, [getValues, seatingMap, seatingMaps, setValue, tickets])
}
