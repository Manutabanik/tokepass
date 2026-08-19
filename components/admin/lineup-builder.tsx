"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  GripVertical,
  LoaderCircle,
  Plus,
  Search,
  Star,
  Trash2,
  UserPlus,
} from "lucide-react"
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import {
  addArtistToLineup,
  createArtist,
  persistEventLineupSnapshot,
  removeArtistFromLineup,
  searchArtists,
  searchSpotifyArtists,
  syncArtistAudioPreviews,
  updateArtistAudioPreview,
} from "@/app/actions/artists"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArtistAvatar } from "@/components/shared/artist-avatar"
import {
  type ArtistSearchHit,
  type LineupDraftItem,
} from "@/lib/artists"
import { cn, tapFeedbackClass } from "@/lib/utils"

type SuggestItem = {
  key: string
  name: string
  imageUrl: string | null
  genre: string | null
  spotifyId: string | null
  artistId: string | null
  source: "spotify" | "local"
  topTrackPreviewUrl: string | null
  topTrackName: string | null
}

export function LineupBuilder({
  eventId,
  value,
  onChange,
}: {
  eventId?: string | null
  value: LineupDraftItem[]
  onChange: (next: LineupDraftItem[]) => void
}) {
  const listId = useId()
  const reduceMotion = useReducedMotion()
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<SuggestItem[]>([])
  const [fetchedFor, setFetchedFor] = useState("")
  const [manualOpen, setManualOpen] = useState(false)
  const [manualName, setManualName] = useState("")
  const [manualPreviewUrl, setManualPreviewUrl] = useState("")
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const persistRef = useRef<number | null>(null)
  const commitRef = useRef<(next: LineupDraftItem[]) => void>(() => {})
  const rootRef = useRef<HTMLElement | null>(null)
  const previewSyncKeyRef = useRef("")

  const takenKeys = useMemo(() => {
    const names = new Set(value.map((item) => item.name.trim().toLowerCase()))
    const spotify = new Set(
      value.map((item) => item.spotifyId).filter((id): id is string => Boolean(id)),
    )
    const artists = new Set(
      value.map((item) => item.artistId).filter((id): id is string => Boolean(id)),
    )
    return { names, spotify, artists }
  }, [value])

  const searching = query.trim().length >= 2 && fetchedFor !== query.trim()

  const visibleSuggestions = useMemo(() => {
    return suggestions.filter((item) => {
      if (item.spotifyId && takenKeys.spotify.has(item.spotifyId)) return false
      if (item.artistId && takenKeys.artists.has(item.artistId)) return false
      if (takenKeys.names.has(item.name.trim().toLowerCase())) return false
      return true
    })
  }, [suggestions, takenKeys])

  useEffect(() => {
    const needle = query.trim()
    if (needle.length < 2) return

    let cancelled = false
    const timer = window.setTimeout(() => {
      void Promise.all([searchSpotifyArtists(needle), searchArtists(needle)])
        .then(([spotify, local]) => {
          if (cancelled) return
          const next: SuggestItem[] = []
          for (const hit of spotify.data ?? []) {
            next.push({
              key: `spotify:${hit.spotifyId}`,
              name: hit.name,
              imageUrl: hit.imageUrl,
              genre: hit.genres?.[0] ?? null,
              spotifyId: hit.spotifyId,
              artistId: null,
              source: "spotify",
              topTrackPreviewUrl: null,
              topTrackName: null,
            })
          }
          for (const hit of local.data ?? []) {
            if (
              next.some(
                (item) => item.name.toLowerCase() === hit.name.toLowerCase(),
              )
            ) {
              continue
            }
            next.push({
              key: `local:${hit.id}`,
              name: hit.name,
              imageUrl: hit.imageUrl,
              genre: null,
              spotifyId: hit.spotifyId,
              artistId: hit.id,
              source: "local",
              topTrackPreviewUrl: hit.topTrackPreviewUrl,
              topTrackName: hit.topTrackName,
            })
          }
          setSuggestions(next.slice(0, 8))
          setFetchedFor(needle)
        })
        .catch(() => {
          if (cancelled) return
          setSuggestions([])
          setFetchedFor(needle)
        })
    }, 300)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query])

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
        setManualOpen(false)
      }
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [])

  function commit(next: LineupDraftItem[]) {
    const ordered = next.map((item, index) => ({ ...item, order: index }))
    onChange(ordered)
    if (!eventId) return
    if (persistRef.current) window.clearTimeout(persistRef.current)
    persistRef.current = window.setTimeout(() => {
      startTransition(() => {
        void persistEventLineupSnapshot(eventId, ordered)
      })
    }, 400)
  }

  useEffect(() => {
    commitRef.current = commit
  })

  useEffect(() => {
    const missing = value.filter(
      (item) =>
        item.artistId &&
        item.spotifyId &&
        !item.topTrackPreviewUrl?.trim(),
    )
    const key = missing.map((item) => item.artistId).join(",")
    if (!key || previewSyncKeyRef.current === key) return
    previewSyncKeyRef.current = key
    const ids = missing
      .map((item) => item.artistId)
      .filter((id): id is string => Boolean(id))
    startTransition(() => {
      void syncArtistAudioPreviews({ artistIds: ids }).then((result) => {
        if (!result.success || result.data.updated === 0) return
        const previews = result.data.previews
        commitRef.current(
          value.map((item) => {
            const hit = item.artistId ? previews[item.artistId] : null
            if (!hit?.previewUrl) return item
            return {
              ...item,
              topTrackPreviewUrl: hit.previewUrl,
              topTrackName: hit.trackName,
            }
          }),
        )
      })
    })
  }, [value])

  async function ensureArtist(item: SuggestItem): Promise<ArtistSearchHit | null> {
    if (item.artistId) {
      return {
        id: item.artistId,
        name: item.name,
        imageUrl: item.imageUrl,
        spotifyId: item.spotifyId,
        topTrackPreviewUrl: item.topTrackPreviewUrl,
        topTrackName: item.topTrackName,
      }
    }
    const created = await createArtist({
      name: item.name,
      imageUrl: item.imageUrl ?? undefined,
      spotifyId: item.spotifyId ?? undefined,
      topTrackPreviewUrl: item.topTrackPreviewUrl,
      topTrackName: item.topTrackName,
    })
    if (created.success) return created.data
    const local = await searchArtists(item.name)
    if (!local.success) {
      toast.error(created.error)
      return null
    }
    return (
      local.data.find((hit) => hit.spotifyId && hit.spotifyId === item.spotifyId) ??
      local.data.find((hit) => hit.name.toLowerCase() === item.name.toLowerCase()) ??
      null
    )
  }

  function selectSuggestion(item: SuggestItem) {
    startTransition(async () => {
      const artist = await ensureArtist(item)
      if (!artist) return

      let lineupEntryId: string | null = null
      if (eventId) {
        const added = await addArtistToLineup(
          eventId,
          artist.id,
          undefined,
          value.length,
        )
        if (added.success) lineupEntryId = added.data.id
      }

      commit([
        ...value,
        {
          id: lineupEntryId ?? crypto.randomUUID(),
          artistId: artist.id,
          lineupEntryId,
          spotifyId: artist.spotifyId,
          name: artist.name,
          imageUrl: artist.imageUrl,
          genre: item.genre,
          performanceTime: "",
          stage: "",
          order: value.length,
          isHeadliner: false,
          topTrackPreviewUrl: artist.topTrackPreviewUrl,
          topTrackName: artist.topTrackName,
        },
      ])
      setQuery("")
      setOpen(false)
      setManualOpen(false)
    })
  }

  function createManual() {
    const name = manualName.trim()
    if (!name) {
      toast.error("Escribí el nombre del artista.")
      return
    }
    selectSuggestion({
      key: `manual:${name}`,
      name,
      imageUrl: null,
      genre: null,
      spotifyId: null,
      artistId: null,
      source: "local",
      topTrackPreviewUrl: manualPreviewUrl.trim() || null,
      topTrackName: null,
    })
    setManualName("")
    setManualPreviewUrl("")
  }

  function updateItem(id: string, patch: Partial<LineupDraftItem>) {
    commit(value.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  function removeItem(item: LineupDraftItem) {
    startTransition(async () => {
      if (eventId && item.lineupEntryId) {
        await removeArtistFromLineup(eventId, item.lineupEntryId)
      }
      commit(value.filter((row) => row.id !== item.id))
    })
  }

  function moveItem(fromId: string, toId: string) {
    if (fromId === toId) return
    const from = value.findIndex((item) => item.id === fromId)
    const to = value.findIndex((item) => item.id === toId)
    if (from < 0 || to < 0) return
    const next = [...value]
    const [moved] = next.splice(from, 1)
    if (!moved) return
    next.splice(to, 0, moved)
    commit(next)
  }

  return (
    <section
      ref={rootRef}
      className="space-y-4 rounded-2xl border border-zinc-200 bg-card p-5 shadow-sm dark:border-zinc-800"
    >
      <div>
        <h3 className="text-sm font-semibold text-foreground">Carga de artistas</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Buscá en Spotify o creá el artista a mano. Arrastrá para reordenar.
          Tocá la estrella para destacar un headliner.
        </p>
      </div>

      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar en Spotify"
          className="h-11 rounded-xl pl-9"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${listId}-suggest`}
        />
        {searching ? (
          <LoaderCircle
            className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        ) : null}

        {open && (query.trim().length >= 2 || manualOpen) ? (
          <div
            id={`${listId}-suggest`}
            className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-border bg-card shadow-lg"
          >
            <ul className="max-h-72 overflow-y-auto py-1">
              {visibleSuggestions.map((item) => (
                <li key={item.key}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => selectSuggestion(item)}
                    className={cn(
                      tapFeedbackClass,
                      "flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/70",
                    )}
                  >
                    <ArtistAvatar name={item.name} imageUrl={item.imageUrl} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {item.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.genre || (item.source === "spotify" ? "Spotify" : "Catálogo TokePass")}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="border-t border-border p-2">
              {manualOpen ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      value={manualName}
                      onChange={(event) => setManualName(event.target.value)}
                      placeholder="Nombre del artista"
                      className="h-9 rounded-xl"
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={pending}
                      onClick={createManual}
                      className={cn(tapFeedbackClass, "rounded-xl")}
                    >
                      Crear artista
                    </Button>
                  </div>
                  <Input
                    value={manualPreviewUrl}
                    onChange={(event) => setManualPreviewUrl(event.target.value)}
                    placeholder="URL de muestra de audio (opcional)"
                    className="h-9 rounded-xl"
                    inputMode="url"
                  />
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(tapFeedbackClass, "w-full justify-start rounded-xl")}
                  onClick={() => {
                    setManualOpen(true)
                    setManualName(query.trim())
                  }}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Crear nuevo artista
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {value.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
          <UserPlus className="size-4 shrink-0" aria-hidden="true" />
          Todavía no hay artistas en la grilla.
        </div>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {value.map((item) => (
              <motion.li
                key={item.id}
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
                draggable
                onDragStart={(event) => {
                  const target = event.target as HTMLElement
                  if (target.closest("button, input")) {
                    event.preventDefault()
                    return
                  }
                  setDraggingId(item.id)
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  if (draggingId) moveItem(draggingId, item.id)
                  setDraggingId(null)
                }}
                onDragEnd={() => setDraggingId(null)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2 shadow-sm",
                  draggingId === item.id && "opacity-60",
                )}
              >
                <span
                  className="grid size-8 shrink-0 cursor-grab place-items-center rounded-lg text-muted-foreground active:cursor-grabbing"
                  aria-label={`Reordenar ${item.name}`}
                >
                  <GripVertical className="size-4" aria-hidden="true" />
                </span>
                <ArtistAvatar name={item.name} imageUrl={item.imageUrl} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {item.name}
                  </p>
                  <Input
                    value={item.stage ?? ""}
                    onChange={(event) =>
                      updateItem(item.id, { stage: event.target.value })
                    }
                    placeholder="Escenario o pista"
                    className="mt-1 h-8 rounded-lg text-xs"
                  />
                  <Input
                    value={item.topTrackPreviewUrl ?? ""}
                    onChange={(event) => {
                      const nextUrl = event.target.value
                      updateItem(item.id, { topTrackPreviewUrl: nextUrl || null })
                      if (!item.artistId) return
                      if (persistRef.current) window.clearTimeout(persistRef.current)
                      persistRef.current = window.setTimeout(() => {
                        startTransition(() => {
                          void updateArtistAudioPreview({
                            artistId: item.artistId!,
                            previewUrl: nextUrl || null,
                            trackName: item.topTrackName,
                          })
                        })
                      }, 500)
                    }}
                    placeholder="URL de muestra de audio (opcional)"
                    className="mt-1 h-8 rounded-lg text-xs"
                    inputMode="url"
                  />
                </div>
                <Input
                  type="time"
                  value={item.performanceTime ?? ""}
                  onChange={(event) =>
                    updateItem(item.id, { performanceTime: event.target.value })
                  }
                  aria-label={`Horario de presentación de ${item.name}`}
                  className="h-9 w-[7.25rem] rounded-xl text-sm"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={pending}
                  onClick={() =>
                    updateItem(item.id, { isHeadliner: !item.isHeadliner })
                  }
                  aria-pressed={item.isHeadliner}
                  aria-label={
                    item.isHeadliner
                      ? `Quitar a ${item.name} de headliners`
                      : `Destacar a ${item.name} como headliner`
                  }
                  className={cn(
                    tapFeedbackClass,
                    "rounded-full",
                    item.isHeadliner
                      ? "text-amber-500 hover:text-amber-400"
                      : "text-muted-foreground",
                  )}
                >
                  <Star
                    className={cn("size-4", item.isHeadliner && "fill-current")}
                    aria-hidden="true"
                  />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={pending}
                  onClick={() => removeItem(item)}
                  aria-label={`Quitar ${item.name}`}
                  className={cn(tapFeedbackClass, "rounded-full text-muted-foreground")}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  )
}

