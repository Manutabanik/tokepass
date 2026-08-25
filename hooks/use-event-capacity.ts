"use client"

import type { UseFormReturn } from "react-hook-form"

import {
  computeEventCapacity,
  type EventCapacitySnapshot,
} from "@/lib/inventory/capacity-budget"
import type { EventFormValues } from "@/lib/validations/event-form"

export function useEventCapacity(
  form: UseFormReturn<EventFormValues>,
): EventCapacitySnapshot {
  const tickets = form.watch("tickets") ?? []
  const venueMap = form.watch("venue.venueMap")
  const zones = form.watch("venue.zones")
  const venueCapacity = form.watch("venue.capacity")
  const customMaxCapacity = form.watch("venue.customMaxCapacity")
  const hasSeatingPlan = Boolean(form.watch("basics.hasSeatingPlan"))

  return computeEventCapacity({
    tickets,
    venueMap: hasSeatingPlan ? venueMap : null,
    zones: hasSeatingPlan ? zones : null,
    hasSeatingPlan,
    baseVenueCapacity: venueCapacity,
    customMaxCapacity,
  })
}
