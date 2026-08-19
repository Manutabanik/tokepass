"use client"

import { Check, LoaderCircle, Music, Search } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"

import { ArtistAvatar } from "@/components/shared/artist-avatar"
import { Input } from "@/components/ui/input"
import { useDebounce } from "@/hooks/use-debounce"
import { cn } from "@/lib/utils"

export type SpotifyArtistSuggestion = {
  spotifyId: string
  name: string
  imageUrl: string | null
  spotifyUrl: string
}

function readSuggestions(payload: unknown): SpotifyArtistSuggestion[] {
  if (!payload || typeof payload !== "object") return []
  const items = (payload as { items?: unknown }).items
  if (!Array.isArray(items)) return []
  const next: SpotifyArtistSuggestion[] = []
  for (const item of items) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    const name = typeof row.name === "string" ? row.name.trim() : ""
    const spotifyId =
      typeof row.spotifyId === "string" ? row.spotifyId.trim() : ""
    if (!name) continue
    const imageUrl =
      typeof row.imageUrl === "string" && row.imageUrl.trim()
        ? row.imageUrl.trim()
        : null
    const spotifyUrl =
      typeof row.spotifyUrl === "string" && row.spotifyUrl.trim()
        ? row.spotifyUrl.trim()
        : spotifyId
          ? `https://open.spotify.com/artist/${encodeURIComponent(spotifyId)}`
          : ""
    next.push({
      spotifyId,
      name,
      imageUrl,
      spotifyUrl,
    })
    if (next.length >= 5) break
  }
  return next
}

export function SpotifyArtistTypeahead({
  value,
  onNameChange,
  onSelect,
  inputId,
  placeholder = "Buscar en Spotify o escribir a mano",
}: {
  value: string
  onNameChange: (name: string) => void
  onSelect: (artist: SpotifyArtistSuggestion) => void
  inputId?: string
  placeholder?: string
}) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<SpotifyArtistSuggestion[]>([])
  const debounced = useDebounce(value.trim(), 500)
  const searching = value.trim().length >= 2 && loading

  useEffect(() => {
    const needle = debounced
    if (needle.length < 2) {
      setItems([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    void fetch(`/api/spotify/search?q=${encodeURIComponent(needle)}`, {
      credentials: "same-origin",
    })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => ({ items: [] }))
        if (!cancelled) setItems(readSuggestions(payload))
      })
      .catch(() => {
        if (!cancelled) setItems([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [debounced])

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", onPointerDown)
    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [])

  const showList = open && value.trim().length >= 2

  return (
    <div ref={rootRef} className="relative">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        id={inputId}
        value={value}
        onChange={(event) => {
          onNameChange(event.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="h-10 rounded-xl pl-9 pr-9"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
      />
      {searching ? (
        <LoaderCircle
          className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
          aria-hidden="true"
        />
      ) : (
        <Music
          className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
      )}

      {showList ? (
        <div
          id={listId}
          role="listbox"
          className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-border bg-card shadow-lg"
        >
          {items.length > 0 ? (
            <ul className="max-h-72 overflow-y-auto py-1">
              {items.map((item) => {
                const selected =
                  item.name.trim().toLowerCase() === value.trim().toLowerCase()
                return (
                  <li key={item.spotifyId || item.name} role="option" aria-selected={selected}>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        onSelect(item)
                        setOpen(false)
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/70",
                      )}
                    >
                      <ArtistAvatar
                        name={item.name}
                        imageUrl={item.imageUrl}
                        size="sm"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-foreground">
                          {item.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          Spotify
                        </span>
                      </span>
                      {selected ? (
                        <Check className="size-4 shrink-0 text-violet-600" aria-hidden="true" />
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="px-3 py-2.5 text-xs text-muted-foreground">
              {searching
                ? "Buscando en Spotify…"
                : "Sin coincidencias. Podés dejar el nombre escrito a mano."}
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}
