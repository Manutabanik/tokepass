"use client"

import { LoaderCircle } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { resolveArtistSpotifyId } from "@/app/actions/artists"
import { ArtistAvatar } from "@/components/shared/artist-avatar"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  beginSpotifyMiniPlayerResolve,
  closeSpotifyMiniPlayer,
  setActiveSpotifyId,
  toggleSpotifyMiniPlayer,
  useIsSpotifyMiniPlayerActive,
} from "@/hooks/use-spotify-mini-player"
import {
  filterLineupByDay,
  hasEventLineup,
  visibleLineupArtists,
  type EventLineupArtist,
  type EventLineupData,
  type EventLineupSlot,
} from "@/lib/event-lineup"
import { formatEventTime } from "@/lib/format"
import type { ScheduleDay } from "@/types/events"
import { isSpotifyArtistId } from "@/lib/spotify/embed"
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
  onResolved,
}: {
  artist: EventLineupArtist
  size: "xs" | "hero"
  onResolved?: (artistId: string, spotifyId: string) => void
}) {
  const name = artist.name?.trim() || "Artista"
  const [resolving, setResolving] = useState(false)
  const requestRef = useRef(0)
  const active = useIsSpotifyMiniPlayerActive({
    id: artist.id,
    spotifyId: artist.spotifyId,
  })

  const handleClick = () => {
    if (isSpotifyArtistId(artist.spotifyId)) {
      toggleSpotifyMiniPlayer(artist.spotifyId, name, artist.id)
      return
    }

    const token = ++requestRef.current
    setResolving(true)
    beginSpotifyMiniPlayerResolve(artist.id, name)
    void resolveArtistSpotifyId(artist.id, name)
      .then((result) => {
        if (token !== requestRef.current) return
        if (!result.success) {
          closeSpotifyMiniPlayer()
          toast.error(result.error)
          return
        }
        if (!isSpotifyArtistId(result.data.spotifyId)) {
          closeSpotifyMiniPlayer()
          toast.error("No encontramos este artista en Spotify.")
          return
        }
        onResolved?.(artist.id, result.data.spotifyId)
        setActiveSpotifyId(result.data.spotifyId, {
          artistId: artist.id,
          artistName: name,
        })
      })
      .catch(() => {
        if (token !== requestRef.current) return
        closeSpotifyMiniPlayer()
        toast.error("No se pudo abrir el reproductor.")
      })
      .finally(() => {
        if (token !== requestRef.current) return
        setResolving(false)
      })
  }

  const label = resolving
    ? `Buscando a ${name} en Spotify`
    : active
      ? `Cerrar reproductor de ${name}`
      : `Escuchar a ${name}`

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={resolving}
      className={cn(
        tapFeedbackClass,
        "relative block cursor-pointer rounded-full transition-transform hover:scale-105",
      )}
      aria-pressed={active}
      aria-busy={resolving}
      aria-label={label}
    >
      <ArtistAvatar
        name={name}
        imageUrl={artist.imageUrl}
        size={size}
        className={cn(
          resolving && "animate-pulse opacity-70",
          active &&
            "ring-2 ring-primary ring-offset-2 ring-offset-background animate-pulse",
        )}
      />
      {resolving ? (
        <span className="absolute inset-0 grid place-items-center rounded-full bg-black/35">
          <LoaderCircle
            className="size-5 animate-spin text-white"
            aria-hidden="true"
          />
        </span>
      ) : null}
    </button>
  )
}

function ArtistChip({
  artist,
  onResolved,
}: {
  artist: EventLineupArtist
  onResolved?: (artistId: string, spotifyId: string) => void
}) {
  const name = artist.name?.trim() || "Artista"
  const time = formatSlotTime(artist.performanceTime)
  return (
    <li className="flex items-center gap-2 rounded-full border border-border bg-secondary/40 py-1 pr-3 pl-1">
      <ArtistGridAvatar artist={artist} size="xs" onResolved={onResolved} />
      <span className="max-w-[10rem] truncate text-sm font-semibold text-foreground">
        {name}
      </span>
      {time ? (
        <span className="text-xs font-medium text-muted-foreground">{time}</span>
      ) : null}
    </li>
  )
}

function VisualLineup({
  artists,
  onResolved,
}: {
  artists: EventLineupArtist[]
  onResolved?: (artistId: string, spotifyId: string) => void
}) {
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
              <ArtistGridAvatar
                artist={artist}
                size="hero"
                onResolved={onResolved}
              />
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
              <ArtistChip
                key={artist.id}
                artist={artist}
                onResolved={onResolved}
              />
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
  selectedDayId = null,
  scheduleDays = [],
}: {
  data?: EventLineupData | null
  className?: string
  selectedDayId?: string | null
  scheduleDays?: ScheduleDay[]
}) {
  const reduceMotion = useReducedMotion()
  const [artists, setArtists] = useState(data?.artists ?? [])

  useEffect(() => {
    setArtists(data?.artists ?? [])
  }, [data])

  useEffect(() => {
    return () => {
      closeSpotifyMiniPlayer()
    }
  }, [])

  const filtered = useMemo(
    () =>
      filterLineupByDay(
        { artists, slots: data?.slots ?? [] },
        selectedDayId,
        scheduleDays,
      ),
    [artists, data?.slots, scheduleDays, selectedDayId],
  )

  if (!data || !hasEventLineup(data)) return null
  const hasArtists = artists.length > 0
  const visibleArtists = filtered.artists
  const dayKey = selectedDayId ?? "all"

  return (
    <section aria-label="Grilla de artistas y cronograma" className={cn("space-y-2", className)}>
      {hasArtists ? (
        <div>
          <h2 className="mb-3 text-xl font-bold tracking-tight text-foreground">
            Grilla de artistas
          </h2>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={dayKey}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: "easeInOut" }}
            >
              {visibleArtists.length > 0 ? (
                <VisualLineup
                  artists={visibleArtists}
                  onResolved={(artistId, spotifyId) => {
                    setArtists((current) =>
                      current.map((artist) =>
                        artist.id === artistId
                          ? { ...artist, spotifyId }
                          : artist,
                      ),
                    )
                  }}
                />
              ) : (
                <p className="rounded-2xl border border-border/60 bg-secondary/30 px-4 py-6 text-center text-sm text-muted-foreground">
                  Lineup a confirmar para este día.
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      ) : null}
      {!hasArtists && filtered.slots.length > 0 ? (
        <div>
          <h2 className="mb-3 text-xl font-bold tracking-tight text-foreground">
            Cronograma
          </h2>
          <SmartTimeline slots={filtered.slots} />
        </div>
      ) : null}
    </section>
  )
}
