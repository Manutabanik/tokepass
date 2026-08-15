"use client"

import { ArrowLeft, Copy, Share2 } from "lucide-react"
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

const iconButtonClass =
  "size-10 min-h-10 min-w-10 rounded-full border border-border bg-background p-2.5 text-foreground shadow-none hover:bg-muted"

export function EventActionBar({
  eventId,
  title,
  showBackLink,
}: {
  eventId: string
  title: string
  showBackLink: boolean
  date?: string
  location?: string
  details?: string | null
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
