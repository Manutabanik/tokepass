"use client"

import { ArtistAvatar } from "@/components/shared/artist-avatar"
import {
  hasEventLineup,
  type EventLineupArtist,
  type EventLineupData,
  type EventLineupSlot,
} from "@/lib/event-lineup"
import { formatEventTime } from "@/lib/format"
import { cn } from "@/lib/utils"

function formatSlotTime(value: string | null | undefined): string {
  const raw = value?.trim()
  if (!raw) return ""
  if (/^\d{1,2}:\d{2}$/.test(raw)) return raw
  const parsed = Date.parse(raw)
  if (Number.isNaN(parsed)) return raw
  return formatEventTime(raw) || raw
}

function VisualLineup({ artists }: { artists: EventLineupArtist[] }) {
  return (
    <div
      className="hide-scrollbar flex w-full snap-x touch-pan-x gap-4 overflow-x-auto overscroll-x-contain py-2"
      aria-label="Grilla de artistas"
    >
      {artists.map((artist) => {
        const name = artist.name?.trim() || "Artista"
        const time = formatSlotTime(artist.performanceTime)
        return (
          <div
            key={artist.id}
            className="group flex min-w-[90px] max-w-[100px] snap-start cursor-pointer flex-col items-center gap-2"
          >
            <ArtistAvatar
              name={name}
              imageUrl={artist.imageUrl}
              size="xl"
              className="transition-colors group-hover:border-primary"
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
    </div>
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
  if (!data || !hasEventLineup(data)) return null

  return (
    <section aria-label="Grilla de artistas y cronograma" className={cn("space-y-2", className)}>
      {data.artists.length > 0 ? (
        <div>
          <h2 className="mb-3 text-xl font-bold tracking-tight text-foreground">
            Grilla de artistas
          </h2>
          <VisualLineup artists={data.artists} />
        </div>
      ) : null}
      {data.slots.length > 0 ? (
        <div className={data.artists.length > 0 ? "mt-4" : undefined}>
          <h2 className="mb-3 text-xl font-bold tracking-tight text-foreground">
            Cronograma
          </h2>
          <SmartTimeline slots={data.slots} />
        </div>
      ) : null}
    </section>
  )
}
