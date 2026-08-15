"use client"

import {
  ArrowLeft,
  CalendarPlus,
  Share2,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { listMyFavoriteEventIds } from "@/app/actions/favorites"
import { FavoriteToggleButton } from "@/components/public/favorite-toggle-button"
import { Button } from "@/components/ui/button"
import { cn, tapFeedbackClass } from "@/lib/utils"

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
    details: input.details?.trim() || "Entrada emitida con Tokepass",
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

const heroIconClassName = cn(
  tapFeedbackClass,
  "size-11 min-h-11 min-w-11 rounded-full border border-white/20 bg-black/30 text-white shadow-none backdrop-blur-md hover:bg-black/45 hover:text-white",
)

export function EventDetailTopActions({
  eventId,
  title,
  showBackLink,
  date,
  location,
  details,
}: {
  eventId: string
  title: string
  showBackLink: boolean
  date?: string
  location?: string
  details?: string | null
}) {
  const [favorited, setFavorited] = useState(false)
  const calendarHref = date
    ? buildGoogleCalendarUrl({
        title,
        date,
        location: location ?? "",
        details,
      })
    : null

  useEffect(() => {
    let cancelled = false
    void listMyFavoriteEventIds().then((ids) => {
      if (!cancelled) setFavorited(ids.includes(eventId))
    })
    return () => {
      cancelled = true
    }
  }, [eventId])

  async function share() {
    const url = typeof window !== "undefined" ? window.location.href : ""
    try {
      if (navigator.share) {
        await navigator.share({ title, url, text: title })
        return
      }
      await navigator.clipboard.writeText(url)
      toast.success("Link copiado")
    } catch {
      // User cancelled share sheet — ignore.
    }
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {showBackLink ? (
        <Button
          variant="secondary"
          size="icon"
          className={cn(
            "pointer-events-auto absolute top-4 left-4 z-10 mt-[max(0px,env(safe-area-inset-top))]",
            heroIconClassName,
          )}
          nativeButton={false}
          render={<Link href="/" aria-label="Volver" />}
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </Button>
      ) : null}

      <div className="pointer-events-auto absolute top-4 right-4 z-10 mt-[max(0px,env(safe-area-inset-top))] flex items-center gap-2">
        {calendarHref ? (
          <Button
            variant="secondary"
            size="icon"
            className={heroIconClassName}
            nativeButton={false}
            render={
              <a
                href={calendarHref}
                target="_blank"
                rel="noreferrer"
                aria-label="Añadir al calendario"
              />
            }
          >
            <CalendarPlus className="size-5" aria-hidden="true" />
          </Button>
        ) : null}
        <FavoriteToggleButton
          eventId={eventId}
          initiallyFavorited={favorited}
          className={heroIconClassName}
        />
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label="Compartir evento"
          className={heroIconClassName}
          onClick={() => void share()}
        >
          <Share2 className="size-5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
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
