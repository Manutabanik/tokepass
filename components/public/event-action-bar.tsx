"use client"

import { ArrowLeft, CalendarPlus, Copy, Share2 } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { listMyFavoriteEventIds } from "@/app/actions/favorites"
import { FavoriteToggleButton } from "@/components/public/favorite-toggle-button"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

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

const iconButtonClass =
  "size-10 min-h-10 min-w-10 rounded-full border border-border bg-background p-2.5 text-foreground shadow-none hover:bg-muted"

export function EventActionBar({
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

  async function shareNative() {
    const url = typeof window !== "undefined" ? window.location.href : ""
    try {
      if (navigator.share) {
        await navigator.share({ title, url, text: title })
        return
      }
      await navigator.clipboard.writeText(url)
      toast.success("Link copiado")
    } catch {
      // User cancelled share sheet.
    }
  }

  async function copyLink() {
    const url = typeof window !== "undefined" ? window.location.href : ""
    try {
      await navigator.clipboard.writeText(url)
      toast.success("Link copiado")
    } catch {
      toast.error("No se pudo copiar el link")
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 px-4 md:px-0">
      {showBackLink ? (
        <Button
          variant="outline"
          className="h-10 rounded-full border-border bg-background px-3 text-sm font-semibold text-foreground hover:bg-muted"
          nativeButton={false}
          render={<Link href="/" />}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver
        </Button>
      ) : (
        <span />
      )}

      <div className="flex items-center gap-2">
        {calendarHref ? (
          <Button
            variant="outline"
            size="icon"
            className={iconButtonClass}
            nativeButton={false}
            render={
              <a
                href={calendarHref}
                target="_blank"
                rel="noreferrer"
                aria-label="Agendar al calendario"
              />
            }
          >
            <CalendarPlus className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
        <FavoriteToggleButton
          key={`${eventId}-${favorited ? "on" : "off"}`}
          eventId={eventId}
          initiallyFavorited={favorited}
          tone="bar"
          className={iconButtonClass}
        />
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Compartir evento"
            render={
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={iconButtonClass}
              />
            }
          >
            <Share2 className="size-4" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuItem onClick={() => void shareNative()}>
              <Share2 className="size-4 text-muted-foreground" aria-hidden="true" />
              Compartir
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void copyLink()}>
              <Copy className="size-4 text-muted-foreground" aria-hidden="true" />
              Copiar enlace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
