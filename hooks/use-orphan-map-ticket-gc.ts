"use client"

import { useEffect } from "react"
import { useFormContext, useWatch } from "react-hook-form"

import {
  collectDraftLiveSectorIds,
  draftHasActiveSeatingMap,
  garbageCollectDraftTickets,
  isOrphanMapTicket,
  sanitizeDraftTicketsForPersist,
} from "@/lib/events/draft-seating-map-v2"
import type { EventDraftV2 } from "@/lib/validations/event-draft-v2"

function draftTicketsChanged(
  current: EventDraftV2["tickets"],
  next: EventDraftV2["tickets"],
): boolean {
  if (current.length !== next.length) return true
  return current.some((ticket, index) => {
    const other = next[index]
    return (
      !other ||
      ticket.id !== other.id ||
      ticket.source !== other.source ||
      ticket.sectorId !== other.sectorId ||
      ticket.layoutType !== other.layoutType
    )
  })
}

export function useOrphanMapTicketGarbageCollector() {
  const { getValues, setValue } = useFormContext<EventDraftV2>()
  const tickets = useWatch({ name: "tickets" })
  const seatingMaps = useWatch({ name: "seatingMaps" })
  const seatingMap = useWatch({ name: "seatingMap" })

  useEffect(() => {
    const current = getValues("tickets") ?? []
    const seatingMapsValue = getValues("seatingMaps")
    const seatingMapValue = getValues("seatingMap")
    const mapActive = draftHasActiveSeatingMap({
      seatingMaps: seatingMapsValue,
      seatingMap: seatingMapValue,
    })
    if (!mapActive) {
      const next = sanitizeDraftTicketsForPersist(current, {
        mapActive: false,
        liveSectorIds: [],
      })
      if (!draftTicketsChanged(current, next)) return
      setValue("tickets", next, {
        shouldDirty: true,
        shouldTouch: true,
      })
      return
    }
    const live = collectDraftLiveSectorIds({
      seatingMaps: seatingMapsValue,
      seatingMap: seatingMapValue,
    })
    if (!current.some((ticket) => isOrphanMapTicket(ticket, live))) return
    setValue("tickets", garbageCollectDraftTickets(current, live), {
      shouldDirty: true,
      shouldTouch: true,
    })
  }, [getValues, seatingMap, seatingMaps, setValue, tickets])
}
