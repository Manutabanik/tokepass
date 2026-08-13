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

export function EventDetailTopActions({
  eventId,
  title,
  showBackLink,
}: {
  eventId: string
  title: string
  showBackLink: boolean
}) {
  const [favorited, setFavorited] = useState(false)

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
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between px-4 pt-[max(0.85rem,env(safe-area-inset-top))]">
      {showBackLink ? (
        <Button
          variant="secondary"
          size="icon"
          className="pointer-events-auto size-12 rounded-full border-0 bg-black/45 text-white shadow-lg shadow-black/30 backdrop-blur-md hover:bg-black/60"
          nativeButton={false}
          render={<Link href="/" aria-label="Volver" />}
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </Button>
      ) : (
        <span className="size-12" />
      )}

      <div className="pointer-events-auto flex items-center gap-2">
        <FavoriteToggleButton
          eventId={eventId}
          initiallyFavorited={favorited}
        />
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label="Compartir evento"
          className="size-12 rounded-full border-0 bg-black/45 text-white shadow-lg shadow-black/30 backdrop-blur-md hover:bg-black/60"
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
      className="h-9 rounded-full border-zinc-700 bg-zinc-900/80 text-zinc-200 hover:bg-zinc-800"
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
