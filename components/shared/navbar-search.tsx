"use client"

import { CalendarDays, MapPin, Search, X } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react"
import { createPortal } from "react-dom"

import { searchOmnichannel } from "@/app/actions/public-search"
import { ArtistAvatar, RemoteImage } from "@/components/shared/artist-avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { useDebounce } from "@/hooks/use-debounce"
import { useLockBodyScroll } from "@/hooks/use-lock-body-scroll"
import { formatEventDay } from "@/lib/format"
import {
  OMNI_SEARCH_MIN_CHARS,
  type OmniArtistHit,
  type OmniEventHit,
  type OmniSearchResult,
} from "@/lib/omni-search"
import { exploreCatalogPath } from "@/lib/discovery-filters"
import { publicEventPath } from "@/lib/seo/site"
import { usePublicSearchUiStore } from "@/lib/stores/public-search-ui-store"
import { cn, tapFeedbackClass } from "@/lib/utils"

const EMPTY_RESULTS: OmniSearchResult = { events: [], artists: [] }
const EMPTY_COPY = "No se encontraron eventos o artistas coincidentes"

function activeEventsLabel(count: number): string {
  if (count === 1) return "1 evento activo"
  return `${count} eventos activos`
}

function artistExploreHref(artistId: string): string {
  return exploreCatalogPath({ artist: artistId })
}

function EventThumb({ imageUrl }: { imageUrl: string | null }) {
  return (
    <RemoteImage
      src={imageUrl}
      className="size-11 shrink-0 rounded-md object-cover"
      fallback={
        <div
          className="flex size-11 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-zinc-400 dark:bg-white/10 dark:text-zinc-500"
          aria-hidden="true"
        >
          <CalendarDays className="size-4" />
        </div>
      }
    />
  )
}

function SearchResults({
  results,
  loading,
  canSearch,
  listId,
  onSelect,
}: {
  results: OmniSearchResult
  loading: boolean
  canSearch: boolean
  listId: string
  onSelect: () => void
}) {
  if (!canSearch) {
    return (
      <p className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Escribí al menos {OMNI_SEARCH_MIN_CHARS} caracteres
      </p>
    )
  }

  if (loading) {
    return (
      <div className="space-y-4 px-3 py-3" aria-busy="true" aria-live="polite">
        <div className="space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      </div>
    )
  }

  const hasHits = results.artists.length > 0 || results.events.length > 0
  if (!hasHits) {
    return (
      <p
        className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400"
        role="status"
      >
        {EMPTY_COPY}
      </p>
    )
  }

  return (
    <div id={listId} className="max-h-[min(28rem,70vh)] overflow-y-auto py-2" role="listbox">
      {results.artists.length > 0 ? (
        <section className="px-2 pb-1">
          <h3 className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Artistas
          </h3>
          <ul className="space-y-0.5">
            {results.artists.map((artist) => (
              <li key={artist.id}>
                <ArtistResultRow artist={artist} onSelect={onSelect} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {results.events.length > 0 ? (
        <section className="px-2 pb-1">
          <h3 className="px-2 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Eventos
          </h3>
          <ul className="space-y-0.5">
            {results.events.map((event) => (
              <li key={event.id}>
                <EventResultRow event={event} onSelect={onSelect} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

function ArtistResultRow({
  artist,
  onSelect,
}: {
  artist: OmniArtistHit
  onSelect: () => void
}) {
  return (
    <Link
      href={artistExploreHref(artist.id)}
      role="option"
      onClick={onSelect}
      className={cn(
        tapFeedbackClass,
        "flex items-center gap-3 rounded-xl px-2 py-2 text-left",
        "hover:bg-zinc-100 dark:hover:bg-white/5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40",
      )}
    >
      <ArtistAvatar name={artist.name} imageUrl={artist.imageUrl} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {artist.name}
        </span>
        <span className="block text-xs text-zinc-500 dark:text-zinc-400">
          {activeEventsLabel(artist.activeEventCount)}
        </span>
      </span>
    </Link>
  )
}

function EventResultRow({
  event,
  onSelect,
}: {
  event: OmniEventHit
  onSelect: () => void
}) {
  return (
    <Link
      href={publicEventPath(event)}
      role="option"
      onClick={onSelect}
      className={cn(
        tapFeedbackClass,
        "flex items-center gap-3 rounded-xl px-2 py-2 text-left",
        "hover:bg-zinc-100 dark:hover:bg-white/5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40",
      )}
    >
      <EventThumb imageUrl={event.imageUrl} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {event.title}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3 shrink-0" aria-hidden="true" />
            {formatEventDay(event.date)}
          </span>
          <span className="inline-flex min-w-0 items-center gap-1">
            <MapPin className="size-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{event.location?.trim() || "Online"}</span>
          </span>
        </span>
      </span>
    </Link>
  )
}

export function NavbarSearch() {
  const router = useRouter()
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const mobileInputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const searchOpenTick = usePublicSearchUiStore((state) => state.openTick)
  const [seenSearchTick, setSeenSearchTick] = useState(searchOpenTick)
  if (searchOpenTick !== seenSearchTick) {
    setSeenSearchTick(searchOpenTick)
    if (searchOpenTick > 0) setMobileOpen(true)
  }
  const [results, setResults] = useState<OmniSearchResult>(EMPTY_RESULTS)
  const [fetchedFor, setFetchedFor] = useState("")

  const debouncedQuery = useDebounce(query, 250)
  const typedReady = query.trim().length >= OMNI_SEARCH_MIN_CHARS
  const panelOpen = open || mobileOpen
  const showLoading = typedReady && query.trim() !== fetchedFor

  const dismiss = useCallback(() => {
    setQuery("")
    setResults(EMPTY_RESULTS)
    setFetchedFor("")
    setOpen(false)
    setMobileOpen(false)
  }, [])

  useLockBodyScroll(mobileOpen)

  useEffect(() => {
    const needle = debouncedQuery.trim()
    if (needle.length < OMNI_SEARCH_MIN_CHARS) {
      return
    }

    let cancelled = false
    void searchOmnichannel(needle)
      .then((data) => {
        if (cancelled) return
        setResults(data)
        setFetchedFor(needle)
      })
      .catch(() => {
        if (cancelled) return
        setResults(EMPTY_RESULTS)
        setFetchedFor(needle)
      })

    return () => {
      cancelled = true
    }
  }, [debouncedQuery])

  useEffect(() => {
    if (!panelOpen) return

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault()
        dismiss()
      }
    }

    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [panelOpen, dismiss])

  useEffect(() => {
    if (!open) return

    function onPointer(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener("mousedown", onPointer)
    return () => document.removeEventListener("mousedown", onPointer)
  }, [open])

  useEffect(() => {
    if (!mobileOpen) return
    mobileInputRef.current?.focus()
  }, [mobileOpen])

  function submitExplore(event: FormEvent) {
    event.preventDefault()
    const needle = query.trim()
    dismiss()
    router.push(exploreCatalogPath({ q: needle }))
  }

  const resultsProps = {
    results: typedReady ? results : EMPTY_RESULTS,
    loading: showLoading,
    canSearch: typedReady,
    listId,
    onSelect: dismiss,
  }

  const overlay =
    mobileOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[80] flex flex-col bg-white dark:bg-zinc-950 md:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Buscá por evento, artista o lugar"
          >
            <form
              onSubmit={submitExplore}
              className="flex items-center gap-2 border-b border-zinc-200 px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] dark:border-white/10"
            >
              <button
                type="button"
                onClick={dismiss}
                className={cn(
                  tapFeedbackClass,
                  "grid size-11 shrink-0 place-items-center rounded-full text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/5",
                )}
                aria-label="Cerrar búsqueda"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
              <div
                className="relative min-w-0 flex-1"
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-haspopup="listbox"
              >
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400"
                  aria-hidden="true"
                />
                <input
                  ref={mobileInputRef}
                  type="search"
                  name="omni-search-mobile"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="Buscá por evento, artista o lugar..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-12 w-full rounded-full border border-zinc-200 bg-zinc-50 pl-10 pr-4 text-base text-zinc-900 outline-none placeholder:text-zinc-400 focus-visible:border-violet-400 focus-visible:ring-3 focus-visible:ring-violet-400/30 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                  aria-autocomplete="list"
                  aria-controls={listId}
                />
              </div>
            </form>
            <div className="min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
              <SearchResults {...resultsProps} />
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <div ref={rootRef} className="search-bar relative hidden min-w-0 w-full max-w-md flex-1 md:block">
        <form onSubmit={submitExplore}>
          <label className="sr-only" htmlFor="omni-search-desktop">
            Buscá por evento, artista o lugar
          </label>
          <div
            className="relative"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-haspopup="listbox"
          >
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400"
              aria-hidden="true"
            />
            <input
              id="omni-search-desktop"
              type="search"
              name="omni-search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Buscá por evento, artista o lugar..."
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setOpen(true)
              }}
              onFocus={() => setOpen(true)}
              className="h-10 w-full min-w-0 rounded-full border border-zinc-200 bg-zinc-50 pl-9 pr-3 text-base text-zinc-900 outline-none placeholder:text-zinc-400 focus-visible:border-violet-400 focus-visible:ring-3 focus-visible:ring-violet-400/30 md:text-sm dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              aria-autocomplete="list"
              aria-controls={listId}
            />
          </div>
        </form>

        {open ? (
          <div
            className="absolute right-0 z-[60] mt-2 w-[min(28rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-white/10 dark:bg-zinc-950"
            role="presentation"
          >
            <SearchResults {...resultsProps} />
          </div>
        ) : null}
      </div>

      {overlay}
    </>
  )
}
