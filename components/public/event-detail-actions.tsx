"use client"

import { CalendarPlus } from "lucide-react"

import { EventActionBar } from "@/components/public/event-action-bar"
import { Button } from "@/components/ui/button"

export { EventActionBar }

export function EventDetailTopActions(props: {
  eventId: string
  title: string
  showBackLink: boolean
  date?: string
  location?: string
  details?: string | null
}) {
  return <EventActionBar {...props} />
}

function buildGoogleCalendarUrl(input: {
  title: string
  date: string
  location: string
  details?: string | null
}) {
  const start = new Date(input.date)
  if (Number.isNaN(start.getTime())) return null
  const end = new Date(start.getTime() + 3 * 60 * 60 * 1000)

  const stamp = (value: Date) =>
    value
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z")

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: input.title,
    dates: `${stamp(start)}/${stamp(end)}`,
    location: input.location,
    details: input.details?.trim() || "Entrada emitida con TokePass",
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

export function AddToCalendarButton({
  title,
  date,
  location,
  details,
}: {
  title: string
  date: string
  location: string
  details?: string | null
}) {
  const href = buildGoogleCalendarUrl({ title, date, location, details })
  if (!href) return null

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-9 rounded-full border-border bg-card text-foreground hover:bg-muted"
      nativeButton={false}
      render={
        <a href={href} target="_blank" rel="noreferrer" />
      }
    >
      <CalendarPlus className="size-3.5" aria-hidden="true" />
      Añadir al calendario
    </Button>
  )
}
