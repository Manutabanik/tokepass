"use client"

import { useWatch, type UseFormReturn } from "react-hook-form"

import {
  computeEventCapacity,
  type EventCapacitySnapshot,
} from "@/lib/inventory/capacity-budget"
import type { EventFormValues } from "@/lib/validations/event-form"

export function useEventCapacity(
  form: UseFormReturn<EventFormValues>,
): EventCapacitySnapshot {
  const tickets = useWatch({ control: form.control, name: "tickets" }) ?? []
  const capacityFields = tickets.map(
    (_, index) => `tickets.${index}.capacity` as const,
  )
  useWatch({
    control: form.control,
    name: capacityFields,
    disabled: capacityFields.length === 0,
  })
  const venueMap = useWatch({ control: form.control, name: "venue.venueMap" })
  const zones = useWatch({ control: form.control, name: "venue.zones" })
  const venueCapacity = useWatch({
    control: form.control,
    name: "venue.capacity",
  })
  const customMaxCapacity = useWatch({
    control: form.control,
    name: "venue.customMaxCapacity",
  })
  const hasSeatingPlan = Boolean(
    useWatch({ control: form.control, name: "basics.hasSeatingPlan" }),
  )
  const liveTickets = form.getValues("tickets") ?? tickets

  return computeEventCapacity({
    tickets: liveTickets,
    venueMap: hasSeatingPlan
      ? (form.getValues("venue.venueMap") ?? venueMap)
      : null,
    zones: hasSeatingPlan ? (form.getValues("venue.zones") ?? zones) : null,
    hasSeatingPlan,
    baseVenueCapacity: venueCapacity,
    customMaxCapacity,
  })
}
