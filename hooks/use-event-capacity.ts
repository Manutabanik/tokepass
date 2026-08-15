"use client"

import { useMemo } from "react"
import type { UseFormReturn } from "react-hook-form"

import {
  computeEventCapacity,
  type EventCapacitySnapshot,
} from "@/lib/inventory/capacity-budget"
import type { EventFormValues } from "@/lib/validations/event-form"

export function useEventCapacity(
  form: UseFormReturn<EventFormValues>,
): EventCapacitySnapshot {
  const tickets = form.watch("tickets")
  const venueMap = form.watch("venue.venueMap")
  const baseVenueCapacity = form.watch("venue.capacity")
  const customMaxCapacity = form.watch("venue.customMaxCapacity")

  return useMemo(
    () =>
      computeEventCapacity({
        tickets,
        venueMap,
        baseVenueCapacity,
        customMaxCapacity,
      }),
    [tickets, venueMap, baseVenueCapacity, customMaxCapacity],
  )
}
