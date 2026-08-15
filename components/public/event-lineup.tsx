"use client"

import { useEffect, useState } from "react"

import { ArtistAvatar } from "@/components/shared/artist-avatar"
import { SpotifyMiniPlayer } from "@/components/public/spotify-mini-player"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  closeSpotifyMiniPlayer,
  toggleSpotifyMiniPlayer,
  useIsSpotifyMiniPlayerActive,
} from "@/hooks/use-spotify-mini-player"
import {
  hasArtistSpotifyPlayer,
  hasEventLineup,
  visibleLineupArtists,
  type EventLineupArtist,
  type EventLineupData,
  type EventLineupSlot,
} from "@/lib/event-lineup"
import { formatEventTime } from "@/lib/format"
import { cn, tapFeedbackClass } from "@/lib/utils"

function formatSlotTime(value: string | null | undefined): string {
  const raw = value?.trim()
  if (!raw) return ""
  if (/^\d{1,2}:\d{2}$/.test(raw)) return raw
  const parsed = Date.parse(raw)
  if (Number.isNaN(parsed)) return raw
  return formatEventTime(raw) || raw
}

function moreArtistsLabel(count: number): string {
  return count === 1 ? "+ 1 artista más" : `+ ${count} artistas más`
}

function ArtistGridAvatar({
  artist,
  size,
}: {
  artist: EventLineupArtist
  size: "xs" | "hero"
}) {
  const name = artist.name?.trim() || "Artista"
  const canPlay = hasArtistSpotifyPlayer(artist)
  const active = useIsSpotifyMiniPlayerActive(artist.spotifyId)

  const avatar = (
    <ArtistAvatar
      name={name}
      imageUrl={artist.imageUrl}
      size={size}
      className={
        active
          ? "ring-2 ring-primary ring-offset-2 ring-offset-background animate-pulse"
          : undefined
      }
    />
  )

  if (!canPlay || !artist.spotifyId) return avatar

  const label = active
    ? `Cerrar reproductor de ${name}`
    : `Escuchar a ${name}`

  return (
    <button
      type="button"
      onClick={() => toggleSpotifyMiniPlayer(artist.spotifyId!, name)}
      className={cn(tapFeedbackClass, "relative block rounded-full")}
      aria-pressed={active}
      aria-label={label}
    >
      {avatar}
    </button>
  )
}

function ArtistChip({ artist }: { artist: EventLineupArtist }) {
  const name = artist.name?.trim() || "Artista"
  const time = formatSlotTime(artist.performanceTime)
  return (
    <li className="flex items-center gap-2 rounded-full border border-border bg-secondary/40 py-1 pr-3 pl-1">
      <ArtistGridAvatar artist={artist} size="xs" />
      <span className="max-w-[10rem] truncate text-sm font-semibold text-foreground">
        {name}
      </span>
      {time ? (
        <span className="text-xs font-medium text-muted-foreground">{time}</span>
      ) : null}
    </li>
  )
}

function VisualLineup({ artists }: { artists: EventLineupArtist[] }) {
  const [open, setOpen] = useState(false)
  const { featured, remainingCount } = visibleLineupArtists(artists)

  return (
    <>
      <div
        className="hide-scrollbar flex w-full snap-x snap-mandatory touch-pan-x gap-4 overflow-x-auto overscroll-x-contain pt-7 pb-2"
        aria-label="Grilla de artistas"
      >
        {featured.map((artist) => {
          const name = artist.name?.trim() || "Artista"
          const time = formatSlotTime(artist.performanceTime)
          return (
            <div
              key={artist.id}
              className="flex min-w-[90px] max-w-[110px] shrink-0 snap-start flex-col items-center gap-2"
            >
              <ArtistGridAvatar artist={artist} size="hero" />
              <p className="w-full truncate text-center text-xs font-bold leading-tight text-foreground">
                {name}
              </p>
              {time ? (
                <p className="text-[10px] font-semibold text-muted-foreground">
                  {time}
                </p>
              ) : null}
            </div>
          )
        })}
        {remainingCount > 0 ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={cn(
              tapFeedbackClass,
              "flex min-w-[90px] max-w-[110px] shrink-0 snap-start flex-col items-center gap-2 self-start",
            )}
            aria-label={moreArtistsLabel(remainingCount)}
          >
            <span className="grid h-20 w-20 place-items-center rounded-full border-2 border-dashed border-primary/50 bg-primary/5 text-sm font-black text-primary shadow-md md:h-24 md:w-24">
              +{remainingCount}
            </span>
            <p className="w-full text-center text-xs font-bold leading-tight text-foreground">
              {moreArtistsLabel(remainingCount)}
            </p>
          </button>
        ) : null}
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="gap-0 px-0 pb-6">
          <div
            className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-muted"
            aria-hidden="true"
          />
          <SheetHeader className="border-0 pb-2">
            <SheetTitle>Grilla completa</SheetTitle>
            <SheetDescription>
              Todos los artistas de este evento, con su horario cuando esté
              cargado.
            </SheetDescription>
          </SheetHeader>
          <ul className="flex max-h-[min(70dvh,32rem)] flex-wrap content-start gap-2 overflow-y-auto px-4 pb-2">
            {artists.map((artist) => (
              <ArtistChip key={artist.id} artist={artist} />
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  )
}

function SmartTimeline({ slots }: { slots: EventLineupSlot[] }) {
  return (
    <ol className="relative mt-6 ml-4 space-y-8 border-l-2 border-border/40 pl-6">
      {slots.map((slot) => {
        const time = formatSlotTime(slot.time)
        return (
          <li key={slot.id} className="relative">
            <span
              className="absolute top-1 -left-[calc(1.5rem+9px)] h-4 w-4 rounded-full border-2 border-primary bg-background"
              aria-hidden="true"
            />
            {time ? (
              <p className="mb-1 text-sm font-semibold text-primary">{time}</p>
            ) : null}
            <p className="text-lg font-bold text-foreground">
              {slot.title?.trim() || "Actuación"}
            </p>
            {slot.description ? (
              <p className="text-sm text-muted-foreground">{slot.description}</p>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

export function EventLineup({
  data,
  className,
}: {
  data?: EventLineupData | null
  className?: string
}) {
  useEffect(() => {
    return () => {
      closeSpotifyMiniPlayer()
    }
  }, [])

  if (!data || !hasEventLineup(data)) return null
  const hasArtists = data.artists.length > 0

  return (
    <section aria-label="Grilla de artistas y cronograma" className={cn("space-y-2", className)}>
      {hasArtists ? (
        <div>
          <h2 className="mb-3 text-xl font-bold tracking-tight text-foreground">
            Grilla de artistas
          </h2>
          <VisualLineup artists={data.artists} />
        </div>
      ) : null}
      {!hasArtists && data.slots.length > 0 ? (
        <div>
          <h2 className="mb-3 text-xl font-bold tracking-tight text-foreground">
            Cronograma
          </h2>
          <SmartTimeline slots={data.slots} />
        </div>
      ) : null}
      {hasArtists ? <SpotifyMiniPlayer /> : null}
    </section>
  )
}
