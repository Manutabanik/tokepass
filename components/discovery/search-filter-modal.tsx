"use client"

import {
  ChevronDown,
  MapPin,
  Search,
  Sparkles,
  X,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"

import { ArtistAvatar } from "@/components/shared/artist-avatar"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useDebounce } from "@/hooks/use-debounce"
import { resolveCategoryIcon } from "@/lib/category-icons"
import type { CatalogEvent } from "@/app/actions/public-events"
import type { FeaturedDiscoveryArtist } from "@/lib/discovery-artists"
import {
  DEFAULT_DISCOVERY_CATEGORIES,
  findCategory,
  type DiscoveryCategory,
} from "@/lib/discovery-categories"
import {
  DISCOVERY_DATE_PRESETS,
  datePresetLabel,
  filterCatalogEvents,
  provinceChipLabel,
  type DiscoveryDatePreset,
  type DiscoveryFilterDraft,
} from "@/lib/discovery-filters"
import type { DiscoveryNicheId } from "@/lib/discovery-niches"
import { cn } from "@/lib/utils"

export type SearchFilterModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  events: CatalogEvent[]
  query: string
  city: string
  cities: string[]
  locationsLoading?: boolean
  categoryId: string
  tagId: string | null
  selectedArtistId: string
  datePreset: DiscoveryDatePreset
  featuredArtists?: FeaturedDiscoveryArtist[]
  categories?: DiscoveryCategory[]
  niche?: DiscoveryNicheId
  onCommit: (draft: DiscoveryFilterDraft) => void
  onApply: () => void
}

const DESKTOP_QUERY = "(min-width: 640px)"

function subscribeDesktop(onStoreChange: () => void) {
  const media = window.matchMedia(DESKTOP_QUERY)
  media.addEventListener("change", onStoreChange)
  return () => media.removeEventListener("change", onStoreChange)
}

function useIsDesktop() {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  )
}

const triggerClassName = cn(
  "items-center py-3.5 hover:no-underline",
  "[&_[data-slot=accordion-trigger-icon]]:hidden",
)

export function SearchFilterModal({
  open,
  onOpenChange,
  events,
  query,
  city,
  cities,
  locationsLoading = false,
  categoryId,
  tagId,
  selectedArtistId,
  datePreset,
  featuredArtists = [],
  categories = DEFAULT_DISCOVERY_CATEGORIES,
  niche = "all",
  onCommit,
  onApply,
}: SearchFilterModalProps) {
  const isDesktop = useIsDesktop()
  const [draft, setDraft] = useState<DiscoveryFilterDraft>(() => ({
    query,
    categoryId,
    tagId,
    city,
    artistId: selectedArtistId,
    datePreset,
    niche,
  }))
  const [artistSearch, setArtistSearch] = useState("")
  const wasOpen = useRef(false)

  useEffect(() => {
    if (open && !wasOpen.current) {
      setDraft({
        query,
        categoryId,
        tagId,
        city,
        artistId: selectedArtistId,
        datePreset,
        niche,
      })
      setArtistSearch("")
    }
    wasOpen.current = open
  }, [open, query, categoryId, tagId, city, selectedArtistId, datePreset, niche])

  const debouncedQuery = useDebounce(draft.query, 200)
  const debouncedArtistSearch = useDebounce(artistSearch, 200)

  const resultCount = useMemo(
    () =>
      filterCatalogEvents(events, {
        query: debouncedQuery,
        categoryId: draft.categoryId,
        tagId: draft.tagId,
        city: draft.city,
        artistId: draft.artistId,
        datePreset: draft.datePreset,
        niche: draft.niche,
        categories,
      }).length,
    [events, debouncedQuery, draft, categories],
  )

  const activeCategory = useMemo(
    () => findCategory(categories, draft.categoryId),
    [categories, draft.categoryId],
  )
  const subTags = activeCategory?.tags ?? []
  const selectedArtist = featuredArtists.find(
    (artist) => artist.id === draft.artistId,
  )
  const visibleArtists = useMemo(() => {
    const needle = debouncedArtistSearch.trim().toLowerCase()
    const filtered = needle
      ? featuredArtists.filter((artist) =>
          artist.name.toLowerCase().includes(needle),
        )
      : featuredArtists
    if (
      selectedArtist &&
      !filtered.some((artist) => artist.id === selectedArtist.id)
    ) {
      return [selectedArtist, ...filtered]
    }
    return filtered
  }, [debouncedArtistSearch, featuredArtists, selectedArtist])

  const countLabel =
    resultCount === 1 ? "Mostrar 1 evento" : `Mostrar ${resultCount} eventos`

  const categoryBadge =
    activeCategory && activeCategory.id !== "all" ? activeCategory.label : null
  const artistBadge = selectedArtist?.name ?? null
  const locationBadge =
    draft.city && draft.city !== "todas" ? provinceChipLabel(draft.city) : null
  const dateBadge =
    draft.datePreset !== "all" ? datePresetLabel(draft.datePreset) : null

  function patchDraft(partial: Partial<DiscoveryFilterDraft>) {
    setDraft((current) => ({ ...current, ...partial }))
  }

  function commitAndClose() {
    onCommit(draft)
    onApply()
    onOpenChange(false)
  }

  const body = (
    <SearchFilterModalBody
      chrome={isDesktop ? "dialog" : "sheet"}
      draftQuery={draft.query}
      onQueryChange={(value) => patchDraft({ query: value })}
      categories={categories}
      categoryId={draft.categoryId}
      categoryBadge={categoryBadge}
      subTags={subTags}
      tagId={draft.tagId}
      onCategoryChange={(nextId) =>
        patchDraft({ categoryId: nextId, tagId: null })
      }
      onTagChange={(nextTagId) => patchDraft({ tagId: nextTagId })}
      artistBadge={artistBadge}
      artistSearch={artistSearch}
      onArtistSearchChange={setArtistSearch}
      visibleArtists={visibleArtists}
      featuredArtistsCount={featuredArtists.length}
      selectedArtistId={draft.artistId}
      onToggleArtist={(artistId) =>
        patchDraft({
          artistId: draft.artistId === artistId ? "" : artistId,
        })
      }
      locationBadge={locationBadge}
      locationsLoading={locationsLoading}
      cities={cities}
      city={draft.city}
      onCityChange={(nextCity) => patchDraft({ city: nextCity })}
      dateBadge={dateBadge}
      datePreset={draft.datePreset}
      onDatePresetChange={(nextPreset) =>
        patchDraft({
          datePreset:
            draft.datePreset === nextPreset && nextPreset !== "all"
              ? "all"
              : nextPreset,
        })
      }
      countLabel={countLabel}
      onApply={commitAndClose}
      onClose={() => onOpenChange(false)}
    />
  )

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="gap-0 overflow-hidden bg-background p-0 text-foreground sm:max-w-[600px]"
        >
          {body}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[85vh] gap-0 rounded-t-3xl border-border bg-background p-0 text-foreground"
      >
        {body}
      </SheetContent>
    </Sheet>
  )
}

/** @deprecated Preferí SearchFilterModal — mismo modal, alias de compatibilidad. */
export const MobileFilterSheet = SearchFilterModal

function SearchFilterModalBody({
  chrome,
  draftQuery,
  onQueryChange,
  categories,
  categoryId,
  categoryBadge,
  subTags,
  tagId,
  onCategoryChange,
  onTagChange,
  artistBadge,
  artistSearch,
  onArtistSearchChange,
  visibleArtists,
  featuredArtistsCount,
  selectedArtistId,
  onToggleArtist,
  locationBadge,
  locationsLoading,
  cities,
  city,
  onCityChange,
  dateBadge,
  datePreset,
  onDatePresetChange,
  countLabel,
  onApply,
  onClose,
}: {
  chrome: "dialog" | "sheet"
  draftQuery: string
  onQueryChange: (value: string) => void
  categories: DiscoveryCategory[]
  categoryId: string
  categoryBadge: string | null
  subTags: NonNullable<DiscoveryCategory["tags"]>
  tagId: string | null
  onCategoryChange: (categoryId: string) => void
  onTagChange: (tagId: string | null) => void
  artistBadge: string | null
  artistSearch: string
  onArtistSearchChange: (value: string) => void
  visibleArtists: FeaturedDiscoveryArtist[]
  featuredArtistsCount: number
  selectedArtistId: string
  onToggleArtist: (artistId: string) => void
  locationBadge: string | null
  locationsLoading: boolean
  cities: string[]
  city: string
  onCityChange: (city: string) => void
  dateBadge: string | null
  datePreset: DiscoveryDatePreset
  onDatePresetChange: (preset: DiscoveryDatePreset) => void
  countLabel: string
  onApply: () => void
  onClose: () => void
}) {
  return (
    <div className="flex max-h-[85vh] min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-left sm:px-5 sm:pt-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            {chrome === "dialog" ? (
              <DialogHeader className="gap-0 bg-transparent p-0 pr-0">
                <DialogTitle className="font-heading text-lg font-semibold text-foreground">
                  Categorías
                </DialogTitle>
                <DialogDescription className="mt-1 text-sm text-muted-foreground">
                  Elegí qué tenés ganas de ver y dónde.
                </DialogDescription>
              </DialogHeader>
            ) : (
              <SheetHeader className="gap-0 border-0 p-0">
                <SheetTitle className="text-lg font-semibold text-foreground">
                  Categorías
                </SheetTitle>
                <SheetDescription className="mt-1 text-sm text-muted-foreground">
                  Elegí qué tenés ganas de ver y dónde.
                </SheetDescription>
              </SheetHeader>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            aria-label="Cerrar categorías"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-5 pb-6 sm:px-5">
        <label className="mb-5 block space-y-2">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Buscar
          </span>
          <span className="flex min-h-12 items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
            <Search
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              value={draftQuery}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Buscá por evento, artista o lugar..."
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              className="min-w-0 flex-1 border-0 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
            />
          </span>
        </label>

        <Accordion
          multiple
          defaultValue={["category", "artists"]}
          className="divide-y divide-border rounded-2xl border border-border bg-card px-3"
        >
          <AccordionItem value="category" className="border-0">
            <AccordionTrigger className={triggerClassName}>
              <FilterHeader title="Categoría" badge={categoryBadge} />
            </AccordionTrigger>
            <AccordionContent className="pb-4">
              <div
                className="grid grid-cols-2 gap-2.5 sm:grid-cols-3"
                role="listbox"
                aria-label="Categorías"
              >
                {categories.map((item) => {
                  const Icon =
                    resolveCategoryIcon(item.iconName ?? item.icon) ?? Sparkles
                  const active = categoryId === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => onCategoryChange(item.id)}
                      className={cn(
                        "flex min-h-14 items-center gap-2.5 rounded-2xl border px-3.5 py-3 text-left text-sm font-medium transition",
                        active
                          ? "border-primary bg-primary/20 text-foreground"
                          : "border-border bg-card text-foreground hover:bg-secondary dark:border-white/10",
                      )}
                    >
                      <Icon
                        className="size-4 shrink-0 opacity-80"
                        aria-hidden
                      />
                      <span className="leading-snug">{item.label}</span>
                    </button>
                  )
                })}
              </div>
              {subTags.length > 0 ? (
                <div className="mt-3 flex gap-2 overflow-x-auto pt-1 pb-1 scrollbar-none">
                  {subTags.map((tag) => {
                    const active = tagId === tag.id
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => onTagChange(active ? null : tag.id)}
                        className={cn(
                          "inline-flex min-h-11 shrink-0 items-center rounded-full border px-3.5 text-sm font-medium transition",
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card text-foreground dark:border-white/10",
                        )}
                      >
                        {tag.label}
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="artists" className="border-0">
            <AccordionTrigger className={triggerClassName}>
              <FilterHeader title="Artistas destacados" badge={artistBadge} />
            </AccordionTrigger>
            <AccordionContent className="pb-4">
              <label className="mb-3 flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-3">
                <Search
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={artistSearch}
                  onChange={(event) => onArtistSearchChange(event.target.value)}
                  placeholder="Buscar artista por nombre..."
                  autoComplete="off"
                  autoCorrect="off"
                  className="min-w-0 flex-1 border-0 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground md:text-sm"
                />
              </label>
              {visibleArtists.length > 0 ? (
                <div
                  className="flex gap-2 overflow-x-auto py-1 scrollbar-none sm:flex-wrap sm:overflow-visible"
                  role="listbox"
                  aria-label="Artistas destacados"
                >
                  {visibleArtists.map((artist) => {
                    const active = selectedArtistId === artist.id
                    return (
                      <button
                        key={artist.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => onToggleArtist(artist.id)}
                        className={cn(
                          "inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition",
                          active
                            ? "border-primary bg-primary text-primary-foreground shadow-sm"
                            : "border-border bg-card text-foreground hover:bg-secondary dark:border-white/10",
                        )}
                      >
                        <ArtistAvatar
                          name={artist.name}
                          imageUrl={artist.imageUrl}
                          size="xs"
                          className="h-7 w-7 rounded-full object-cover"
                        />
                        <span className="max-w-[9rem] truncate">
                          {artist.name}
                        </span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {featuredArtistsCount === 0
                    ? "Todavía no hay artistas con eventos activos."
                    : "No se encontraron artistas coincidentes."}
                </p>
              )}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="location" className="border-0">
            <AccordionTrigger className={triggerClassName}>
              <FilterHeader
                title="Ubicación por provincia"
                badge={locationBadge}
              />
            </AccordionTrigger>
            <AccordionContent className="pb-4">
              {locationsLoading && cities.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Cargando provincias…
                </p>
              ) : (
                <div
                  className="flex flex-wrap gap-2 pb-1"
                  role="listbox"
                  aria-label="Provincias"
                >
                  <LocationChip
                    active={city === "todas"}
                    label="Todas las provincias"
                    onClick={() => onCityChange("todas")}
                  />
                  {cities.map((item) => (
                    <LocationChip
                      key={item}
                      active={city.toLowerCase() === item.toLowerCase()}
                      label={provinceChipLabel(item)}
                      onClick={() =>
                        onCityChange(
                          city.toLowerCase() === item.toLowerCase()
                            ? "todas"
                            : item,
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="date" className="border-0">
            <AccordionTrigger className={triggerClassName}>
              <FilterHeader title="Fecha" badge={dateBadge} />
            </AccordionTrigger>
            <AccordionContent className="pb-4">
              <div
                className="flex flex-wrap gap-2"
                role="listbox"
                aria-label="Fecha"
              >
                {DISCOVERY_DATE_PRESETS.map((item) => {
                  const active = datePreset === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => onDatePresetChange(item.id)}
                      className={cn(
                        "inline-flex min-h-11 shrink-0 items-center rounded-full border px-3.5 text-sm font-medium transition",
                        active
                          ? "border-primary bg-primary/20 text-foreground"
                          : "border-border bg-card text-foreground hover:bg-secondary dark:border-white/10",
                      )}
                    >
                      {item.label}
                    </button>
                  )
                })}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <div className="sticky bottom-0 z-20 shrink-0 border-t border-border bg-background px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5">
        <button
          type="button"
          onClick={onApply}
          className="flex h-12 w-full items-center justify-center rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 active:scale-[0.99]"
        >
          {countLabel}
        </button>
      </div>
    </div>
  )
}

function FilterHeader({
  title,
  badge,
}: {
  title: string
  badge?: string | null
}) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2 pr-2">
      <span className="text-sm font-bold text-foreground">{title}</span>
      {badge ? (
        <span className="max-w-[9rem] truncate rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-foreground group-aria-expanded/accordion-trigger:hidden">
          {badge}
        </span>
      ) : null}
      <ChevronDown
        className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-aria-expanded/accordion-trigger:rotate-180"
        aria-hidden="true"
      />
    </span>
  )
}

function LocationChip({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition",
        active
          ? "border-primary bg-primary/20 text-foreground"
          : "border-border bg-card text-foreground hover:bg-secondary dark:border-white/10",
      )}
    >
      <MapPin className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
      {label}
    </button>
  )
}

export function MobileSearchTrigger({
  onClick,
  summary,
}: {
  onClick: () => void
  summary?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-full border px-4 py-3.5 text-left shadow-sm transition",
        "border-border bg-card hover:shadow-md",
        "md:hidden",
      )}
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary">
        <Search className="size-4 text-foreground" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold text-foreground">
          ¿Qué tenés ganas de ver hoy?
        </span>
        <span className="block truncate text-sm text-muted-foreground">
          {summary?.trim() || "Categorías"}
        </span>
      </span>
    </button>
  )
}
