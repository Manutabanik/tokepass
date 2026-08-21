import { Sparkles } from "lucide-react"

import { ArtistAvatar } from "@/components/shared/artist-avatar"
import type { CatalogEventArtist } from "@/lib/discovery-artists"
import { eventLineupHeadline } from "@/lib/discovery-filters"
import { hasArtistSpotifyPlayer } from "@/lib/event-lineup"
import { cn } from "@/lib/utils"

const categoryPillClass =
  "rounded-full border border-border/40 bg-muted/60 px-2.5 py-0.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
const genrePillClass =
  "rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold tracking-wider text-primary uppercase"

export function EventTypePills({
  featured = false,
  category,
  genre,
  className,
}: {
  featured?: boolean
  category?: string | null
  genre?: string | null
  className?: string
}) {
  if (!featured && !category && !genre) return null

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {featured ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold tracking-wider text-emerald-500 uppercase">
          <Sparkles className="size-3" aria-hidden="true" />
          Imperdible
        </span>
      ) : null}
      {category ? <span className={categoryPillClass}>{category}</span> : null}
      {genre ? <span className={genrePillClass}>{genre}</span> : null}
    </div>
  )
}

export function EventLineupTeaser({
  artists,
  compact = false,
}: {
  artists: CatalogEventArtist[]
  compact?: boolean
}) {
  const headline = eventLineupHeadline(artists)
  if (!headline) return null

  const shown = artists.slice(0, 3)
  const linkedToSpotify = artists.some((artist) =>
    hasArtistSpotifyPlayer({ spotifyId: artist.spotifyId ?? null }),
  )

  return (
    <div
      className={cn(
        "pointer-events-none flex min-w-0 items-center gap-2",
        compact
          ? "max-w-full"
          : "w-fit max-w-full rounded-xl border border-border/30 bg-muted/30 px-3 py-1.5",
      )}
    >
      <div className="flex shrink-0 items-center">
        {shown.map((artist, index) => (
          <ArtistAvatar
            key={artist.id || artist.name}
            name={artist.name}
            imageUrl={artist.imageUrl}
            size="xs"
            className={cn(
              "border-2 border-background shadow-sm",
              compact ? "size-6 text-[9px]" : "size-7",
              index > 0 && "-ml-2",
            )}
          />
        ))}
      </div>
      <p className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground/90">
        <span className="truncate font-bold">{headline.lead}</span>
        {headline.extra > 0 ? (
          <span className="shrink-0 text-[11px] text-muted-foreground">
            +{headline.extra} más
          </span>
        ) : null}
        {linkedToSpotify ? (
          <span
            className="size-1.5 shrink-0 rounded-full bg-[#1DB954]"
            title="En Spotify"
            aria-hidden="true"
          />
        ) : null}
      </p>
    </div>
  )
}
