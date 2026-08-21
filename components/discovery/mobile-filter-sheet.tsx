"use client"

import {
  ChevronDown,
  MapPin,
  Search,
  Sparkles,
  X,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { ArtistAvatar } from "@/components/shared/artist-avatar"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
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

type MobileFilterSheetProps = {
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

const triggerClassName = cn(
  "items-center py-3.5 hover:no-underline",
  "[&_[data-slot=accordion-trigger-icon]]:hidden",
)

/**
 * Modal fullscreen en mobile: evita que el teclado virtual colapse
 * filtros inline / dropdowns sobre el hero.
 */
export function MobileFilterSheet({
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
}: MobileFilterSheetProps) {
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className={cn(
          "inset-0 h-dvh max-h-none w-full gap-0 rounded-none border-0 bg-background p-0 text-foreground",
          "data-open:slide-in-from-bottom data-closed:slide-out-to-bottom",
        )}
      >
        <SheetHeader className="shrink-0 border-b border-border/20 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-left sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="text-lg font-semibold text-foreground">
                Buscar y filtrar
              </SheetTitle>
              <SheetDescription className="mt-1 text-sm text-muted-foreground">
                Elegí qué querés hacer y dónde.
              </SheetDescription>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              aria-label="Cerrar filtros"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-5 pb-24 sm:px-5">
            <label className="mb-5 block space-y-2">
              <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Buscar
              </span>
              <span className="flex min-h-12 items-center gap-3 rounded-2xl border border-border/50 bg-secondary/40 px-4 py-3">
                <Search
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={draft.query}
                  onChange={(event) => patchDraft({ query: event.target.value })}
                  placeholder="Buscar evento o artista..."
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
              className="divide-y divide-border/40 rounded-2xl border border-border/40 bg-secondary/20 px-3"
            >
              <AccordionItem value="category" className="border-0">
                <AccordionTrigger className={triggerClassName}>
                  <FilterHeader title="Categoría" badge={categoryBadge} />
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <div
                    className="grid grid-cols-2 gap-2.5"
                    role="listbox"
                    aria-label="Categorías"
                  >
                    {categories.map((item) => {
                      const Icon =
                        resolveCategoryIcon(item.iconName ?? item.icon) ??
                        Sparkles
                      const active = draft.categoryId === item.id
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() =>
                            patchDraft({
                              categoryId: item.id,
                              tagId: null,
                            })
                          }
                          className={cn(
                            "flex min-h-14 items-center gap-2.5 rounded-2xl border px-3.5 py-3 text-left text-sm font-medium transition",
                            active
                              ? "border-violet-500/50 bg-violet-500/10 text-violet-800 dark:border-violet-400/40 dark:bg-violet-500/15 dark:text-violet-100"
                              : "border-border/50 bg-secondary/40 text-foreground hover:bg-secondary",
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
                        const active = draft.tagId === tag.id
                        return (
                          <button
                            key={tag.id}
                            type="button"
                            onClick={() =>
                              patchDraft({ tagId: active ? null : tag.id })
                            }
                            className={cn(
                              "inline-flex min-h-11 shrink-0 items-center rounded-full border px-3.5 text-sm font-medium transition",
                              active
                                ? "border-violet-500/50 bg-violet-600 text-white dark:bg-violet-500"
                                : "border-border/50 bg-secondary/40 text-foreground",
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
                  <FilterHeader
                    title="Artistas destacados"
                    badge={artistBadge}
                  />
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <label className="mb-3 flex min-h-11 items-center gap-2 rounded-xl border border-border/50 bg-background/60 px-3">
                    <Search
                      className="size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      value={artistSearch}
                      onChange={(event) => setArtistSearch(event.target.value)}
                      placeholder="Buscar artista por nombre..."
                      autoComplete="off"
                      autoCorrect="off"
                      className="min-w-0 flex-1 border-0 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground md:text-sm"
                    />
                  </label>
                  {visibleArtists.length > 0 ? (
                    <div
                      className="flex flex-wrap gap-2 py-1"
                      role="listbox"
                      aria-label="Artistas destacados"
                    >
                      {visibleArtists.map((artist) => {
                        const active = draft.artistId === artist.id
                        return (
                          <button
                            key={artist.id}
                            type="button"
                            role="option"
                            aria-selected={active}
                            onClick={() =>
                              patchDraft({
                                artistId: active ? "" : artist.id,
                              })
                            }
                            className={cn(
                              "inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition",
                              active
                                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                                : "border-border/50 bg-secondary/40 text-foreground hover:bg-secondary",
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
                      {featuredArtists.length === 0
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
                        active={draft.city === "todas"}
                        label="Todas las provincias"
                        onClick={() => patchDraft({ city: "todas" })}
                      />
                      {cities.map((item) => (
                        <LocationChip
                          key={item}
                          active={
                            draft.city.toLowerCase() === item.toLowerCase()
                          }
                          label={provinceChipLabel(item)}
                          onClick={() =>
                            patchDraft({
                              city:
                                draft.city.toLowerCase() === item.toLowerCase()
                                  ? "todas"
                                  : item,
                            })
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
                      const active = draft.datePreset === item.id
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() =>
                            patchDraft({
                              datePreset: active && item.id !== "all" ? "all" : item.id,
                            })
                          }
                          className={cn(
                            "inline-flex min-h-11 shrink-0 items-center rounded-full border px-3.5 text-sm font-medium transition",
                            active
                              ? "border-violet-500/50 bg-violet-500/10 text-violet-800 dark:border-violet-400/40 dark:bg-violet-500/15 dark:text-violet-100"
                              : "border-border/50 bg-secondary/40 text-foreground hover:bg-secondary",
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

          <div className="sticky bottom-0 left-0 z-20 w-full border-t border-border/20 bg-gradient-to-t from-background via-background/95 to-transparent px-6 pt-6 pb-4 backdrop-blur-md">
            <button
              type="button"
              onClick={commitAndClose}
              className={cn(
                "flex h-12 w-full items-center justify-center rounded-2xl text-base font-semibold text-white",
                "bg-gradient-to-r from-violet-600 to-fuchsia-600",
                "shadow-sm transition hover:from-violet-500 hover:to-fuchsia-500 hover:shadow-md",
                "mb-[max(0px,env(safe-area-inset-bottom))] active:scale-[0.99]",
              )}
            >
              {countLabel}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
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
        <span className="max-w-[9rem] truncate rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] font-semibold text-violet-800 group-aria-expanded/accordion-trigger:hidden dark:text-violet-100">
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
          ? "border-violet-500/50 bg-violet-500/10 text-violet-800 dark:border-violet-400/40 dark:bg-violet-500/15 dark:text-violet-100"
          : "border-border/50 bg-secondary/40 text-foreground hover:bg-secondary",
      )}
    >
      <MapPin className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
      {label}
    </button>
  )
}

/** Trigger pastilla — solo mobile. No abre teclado: abre el modal. */
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
        "border-zinc-200/90 bg-white/90 hover:shadow-md",
        "dark:border-white/12 dark:bg-zinc-950/80 dark:hover:border-white/20",
        "md:hidden",
      )}
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-zinc-100 dark:bg-white/10">
        <Search className="size-4 text-zinc-700 dark:text-zinc-200" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold text-zinc-900 dark:text-white">
          ¿Qué vas a hacer hoy?
        </span>
        <span className="block truncate text-sm text-zinc-500 dark:text-zinc-400">
          {summary?.trim() || "Buscar filtros"}
        </span>
      </span>
    </button>
  )
}
