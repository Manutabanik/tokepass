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
  const zones = form.watch("venue.zones")

  return useMemo(
    () =>
      computeEventCapacity({
        tickets,
        venueMap,
        zones,
      }),
    [tickets, venueMap, zones],
  )
}
