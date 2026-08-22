"use client"

import { LoaderCircle, Pause, Play } from "lucide-react"
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
  stopArtistPreview,
  useArtistPreview,
} from "@/hooks/use-artist-preview"
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
import { isSpotifyArtistId } from "@/lib/spotify/embed"
import { isPlayablePreviewUrl } from "@/lib/spotify/map"
import type { ScheduleDay } from "@/types/events"
import { cn, tapFeedbackClass } from "@/lib/utils"

type LineupAudioResolved = {
  artistId: string
  previewUrl?: string
  trackName?: string | null
  spotifyId?: string
}

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

function useArtistPreviewSelect(
  artist: EventLineupArtist,
  onResolved?: (update: LineupAudioResolved) => void,
) {
  const name = artist.name?.trim() || "Artista"
  const { playing, toggle } = useArtistPreview(artist.id)
  const spotifyActive = useIsSpotifyMiniPlayerActive({
    id: artist.id,
    spotifyId: artist.spotifyId,
  })
  const [resolving, setResolving] = useState(false)
  const [localSpotifyId, setLocalSpotifyId] = useState(artist.spotifyId)
  const requestRef = useRef(0)
  const previewUrl = isPlayablePreviewUrl(artist.topTrackPreviewUrl)
    ? artist.topTrackPreviewUrl
    : null
  const spotifyId = isSpotifyArtistId(artist.spotifyId)
    ? artist.spotifyId
    : localSpotifyId
  const active = playing || spotifyActive

  const openSpotifyPlayer = async () => {
    stopArtistPreview()
    if (isSpotifyArtistId(spotifyId)) {
      toggleSpotifyMiniPlayer(spotifyId, name, artist.id)
      return
    }

    const token = ++requestRef.current
    setResolving(true)
    beginSpotifyMiniPlayerResolve(artist.id, name)
    try {
      const result = await resolveArtistSpotifyId(artist.id, name)
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
      setLocalSpotifyId(result.data.spotifyId)
      onResolved?.({ artistId: artist.id, spotifyId: result.data.spotifyId })
      setActiveSpotifyId(result.data.spotifyId, {
        artistId: artist.id,
        artistName: name,
      })
    } catch (error) {
      if (token !== requestRef.current) return
      console.error("Error al abrir Spotify:", error)
      closeSpotifyMiniPlayer()
      toast.error("No se pudo abrir el reproductor.")
    } finally {
      if (token === requestRef.current) setResolving(false)
    }
  }

  const selectArtist = async () => {
    if (playing) {
      await toggle(previewUrl ?? "", name)
      return
    }
    if (spotifyActive) {
      closeSpotifyMiniPlayer()
      return
    }

    if (previewUrl) {
      closeSpotifyMiniPlayer()
      await toggle(previewUrl, name)
      return
    }

    await openSpotifyPlayer()
  }

  const label = resolving
    ? `Buscando a ${name} en Spotify`
    : active
      ? `Pausar a ${name}`
      : `Escuchar a ${name}`

  return { name, resolving, active, selectArtist, label }
}

function ArtistPlayBadge({
  size,
  active,
}: {
  size: "xs" | "hero"
  active: boolean
}) {
  return (
    <span
      className={cn(
        "absolute right-0 bottom-0 rounded-full border-2 border-background text-white shadow-md transition-transform group-hover:scale-110",
        size === "xs" ? "p-0.5" : "p-1",
        active ? "bg-emerald-500 animate-pulse" : "bg-emerald-600",
      )}
      aria-hidden="true"
    >
      {active ? (
        <Pause className={cn(size === "xs" ? "size-2" : "size-3", "fill-current")} />
      ) : (
        <Play className={cn(size === "xs" ? "size-2" : "size-3", "fill-current")} />
      )}
    </span>
  )
}

function ArtistGridAvatarVisual({
  artist,
  size,
  resolving,
  active,
}: {
  artist: EventLineupArtist
  size: "xs" | "hero"
  resolving: boolean
  active: boolean
}) {
  const name = artist.name?.trim() || "Artista"
  return (
    <div className="relative inline-block">
      <ArtistAvatar
        name={name}
        imageUrl={artist.imageUrl}
        size={size}
        className={cn(
          resolving && "animate-pulse opacity-70",
          active && "ring-2 ring-emerald-500 ring-offset-2 ring-offset-background",
        )}
      />
      {resolving ? (
        <span className="absolute inset-0 grid place-items-center rounded-full bg-black/35">
          <LoaderCircle
            className="size-5 animate-spin text-white"
            aria-hidden="true"
          />
        </span>
      ) : (
        <ArtistPlayBadge size={size} active={active} />
      )}
    </div>
  )
}

function ArtistChip({
  artist,
  onResolved,
}: {
  artist: EventLineupArtist
  onResolved?: (update: LineupAudioResolved) => void
}) {
  const { name, resolving, active, selectArtist, label } = useArtistPreviewSelect(
    artist,
    onResolved,
  )
  const time = formatSlotTime(artist.performanceTime)

  return (
    <li>
      <button
        type="button"
        onClick={selectArtist}
        disabled={resolving}
        aria-pressed={active}
        aria-busy={resolving}
        aria-label={label}
        className={cn(
          tapFeedbackClass,
          "group flex w-full cursor-pointer items-center gap-2 rounded-full border py-1.5 pr-3 pl-1.5 text-left transition-all duration-200 select-none sm:w-auto",
          active
            ? "border-emerald-500 bg-emerald-500/10 text-emerald-500 shadow-sm"
            : "border-border/60 bg-background text-foreground hover:border-border hover:bg-muted/50",
        )}
      >
        <ArtistGridAvatarVisual
          artist={artist}
          size="xs"
          resolving={resolving}
          active={active}
        />
        <span className="max-w-[140px] truncate text-sm font-bold">{name}</span>
        {time ? (
          <span
            className={cn(
              "text-xs font-medium",
              active ? "text-emerald-500/80" : "text-muted-foreground",
            )}
          >
            {time}
          </span>
        ) : null}
      </button>
    </li>
  )
}

function FeaturedArtistCard({
  artist,
  onResolved,
}: {
  artist: EventLineupArtist
  onResolved?: (update: LineupAudioResolved) => void
}) {
  const { name, resolving, active, selectArtist, label } = useArtistPreviewSelect(
    artist,
    onResolved,
  )
  const time = formatSlotTime(artist.performanceTime)

  return (
    <button
      type="button"
      onClick={selectArtist}
      disabled={resolving}
      aria-pressed={active}
      aria-busy={resolving}
      aria-label={label}
      className={cn(
        tapFeedbackClass,
        "group flex min-w-[90px] max-w-[110px] shrink-0 cursor-pointer snap-start flex-col items-center gap-2 rounded-2xl p-1 transition-transform hover:scale-105",
      )}
    >
      <ArtistGridAvatarVisual
        artist={artist}
        size="hero"
        resolving={resolving}
        active={active}
      />
      <span
        className={cn(
          "w-full truncate text-center text-xs font-bold leading-tight",
          active ? "text-emerald-500" : "text-foreground",
        )}
      >
        {name}
      </span>
      {time ? (
        <span
          className={cn(
            "text-[10px] font-semibold",
            active ? "text-emerald-500/80" : "text-muted-foreground",
          )}
        >
          {time}
        </span>
      ) : null}
    </button>
  )
}

function VisualLineup({
  artists,
  onResolved,
}: {
  artists: EventLineupArtist[]
  onResolved?: (update: LineupAudioResolved) => void
}) {
  const [open, setOpen] = useState(false)
  const { featured, remainingCount } = visibleLineupArtists(artists)

  return (
    <>
      <div
        className="hide-scrollbar flex w-full snap-x snap-mandatory touch-pan-x gap-4 overflow-x-auto overscroll-x-contain pt-7 pb-2"
        aria-label="Grilla de artistas"
      >
        {featured.map((artist) => (
          <FeaturedArtistCard
            key={artist.id}
            artist={artist}
            onResolved={onResolved}
          />
        ))}
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
  const [seenLineup, setSeenLineup] = useState(data)
  if (data !== seenLineup) {
    setSeenLineup(data)
    setArtists(data?.artists ?? [])
  }

  useEffect(() => {
    return () => {
      stopArtistPreview()
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
          <h2 className="mb-1 text-xl font-bold tracking-tight text-foreground">
            Grilla de artistas
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Tocá un artista para escuchar su música
          </p>
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
                  onResolved={(update) => {
                    setArtists((current) =>
                      current.map((artist) =>
                        artist.id === update.artistId
                          ? {
                              ...artist,
                              topTrackPreviewUrl:
                                update.previewUrl ?? artist.topTrackPreviewUrl,
                              topTrackName:
                                update.trackName ?? artist.topTrackName,
                              spotifyId: update.spotifyId ?? artist.spotifyId,
                            }
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
