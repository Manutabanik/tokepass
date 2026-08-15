"use client"

import { X } from "lucide-react"

import {
  closeSpotifyMiniPlayer,
  useSpotifyMiniPlayer,
} from "@/hooks/use-spotify-mini-player"
import {
  SPOTIFY_ARTIST_EMBED_HEIGHT,
  spotifyArtistEmbedSrc,
} from "@/lib/spotify/embed"
import { cn, tapFeedbackClass } from "@/lib/utils"

export function SpotifyMiniPlayer() {
  const { activeArtistSpotifyId, artistName } = useSpotifyMiniPlayer()
  const src = activeArtistSpotifyId
    ? spotifyArtistEmbedSrc(activeArtistSpotifyId)
    : null

  if (!src) return null

  const label = artistName?.trim() || "artista"

  return (
    <div
      className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-50 w-[min(calc(100vw-1.5rem),28rem)] -translate-x-1/2 md:bottom-4"
      role="region"
      aria-label={`Reproductor de ${label}`}
    >
      <div className="relative overflow-hidden rounded-xl border border-border/70 bg-black shadow-2xl">
        <button
          type="button"
          onClick={closeSpotifyMiniPlayer}
          className={cn(
            tapFeedbackClass,
            "absolute top-1 right-1 z-10 grid size-7 place-items-center rounded-full bg-black/80 text-white",
          )}
          aria-label="Cerrar reproductor"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
        <iframe
          src={src}
          title={`Spotify · ${label}`}
          width="100%"
          height={SPOTIFY_ARTIST_EMBED_HEIGHT}
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          className="block h-20 w-full border-0 bg-black"
        />
      </div>
    </div>
  )
}
