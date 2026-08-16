"use client"

import { LoaderCircle, X } from "lucide-react"

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
  const { activeArtistSpotifyId, artistName, resolving } = useSpotifyMiniPlayer()
  const src = activeArtistSpotifyId
    ? spotifyArtistEmbedSrc(activeArtistSpotifyId)
    : null

  if (!src && !resolving) return null

  const label = artistName?.trim() || "artista"

  return (
    <div
      className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-50 w-[min(calc(100vw-1.5rem),28rem)] -translate-x-1/2 lg:bottom-4"
      role="region"
      aria-label={`Reproductor de ${label}`}
    >
      <div className="relative flex items-center gap-2 overflow-hidden rounded-2xl border border-white/10 bg-black/90 p-2 shadow-2xl backdrop-blur-md">
        <button
          type="button"
          onClick={() => closeSpotifyMiniPlayer()}
          className={cn(
            tapFeedbackClass,
            "absolute top-1 right-1 z-10 grid size-7 place-items-center rounded-full bg-black/80 text-white/70 hover:text-white",
          )}
          aria-label="Cerrar reproductor"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
        {src ? (
          <iframe
            src={src}
            title={`Spotify · ${label}`}
            width="100%"
            height={SPOTIFY_ARTIST_EMBED_HEIGHT}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            className="block h-20 w-full max-w-sm rounded-xl border-0 bg-black sm:max-w-md"
          />
        ) : (
          <div
            className="flex h-20 w-full items-center justify-center gap-2 rounded-xl bg-black text-sm text-white/70"
            aria-live="polite"
          >
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Buscando a {label} en Spotify
          </div>
        )}
      </div>
    </div>
  )
}
