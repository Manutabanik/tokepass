"use client"

import {
  MapPin,
  Search,
  Sparkles,
  X,
} from "lucide-react"
import { useEffect, useMemo, useRef } from "react"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { resolveCategoryIcon } from "@/lib/category-icons"
import {
  DEFAULT_DISCOVERY_CATEGORIES,
  findCategory,
  type DiscoveryCategory,
} from "@/lib/discovery-categories"
import { cn } from "@/lib/utils"

type MobileFilterSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  query: string
  onQueryChange: (value: string) => void
  city: string
  cities: string[]
  onCityChange: (value: string) => void
  locationsLoading?: boolean
  categoryId: string
  onCategoryChange: (value: string) => void
  tagId: string | null
  onTagChange: (value: string | null) => void
  categories?: DiscoveryCategory[]
  resultCount: number
  onApply: () => void
}

/**
 * Modal fullscreen en mobile: evita que el teclado virtual colapse
 * filtros inline / dropdowns sobre el hero.
 */
export function MobileFilterSheet({
  open,
  onOpenChange,
  query,
  onQueryChange,
  city,
  cities,
  onCityChange,
  locationsLoading = false,
  categoryId,
  onCategoryChange,
  tagId,
  onTagChange,
  categories = DEFAULT_DISCOVERY_CATEGORIES,
  resultCount,
  onApply,
}: MobileFilterSheetProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const activeCategory = useMemo(
    () => findCategory(categories, categoryId),
    [categories, categoryId],
  )
  const subTags = activeCategory?.tags ?? []

  const countLabel =
    resultCount === 1 ? "Mostrar 1 evento" : `Mostrar ${resultCount} eventos`

  useEffect(() => {
    if (!open) return
    const id = window.setTimeout(() => inputRef.current?.focus(), 80)
    return () => window.clearTimeout(id)
  }, [open])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className={cn(
          "inset-0 h-dvh max-h-none w-full gap-0 rounded-none border-0 p-0",
          "bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100",
          "data-open:slide-in-from-bottom data-closed:slide-out-to-bottom",
        )}
      >
        <SheetHeader className="shrink-0 border-b border-zinc-200/80 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-left dark:border-white/10 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="text-lg font-semibold text-zinc-900 dark:text-white">
                Buscar y filtrar
              </SheetTitle>
              <SheetDescription className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Elegí qué querés hacer y dónde.
              </SheetDescription>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="grid size-11 shrink-0 place-items-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-white/10 dark:hover:text-white"
              aria-label="Cerrar filtros"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-7 overflow-y-auto overscroll-contain px-4 py-5 pb-28 sm:px-5">
          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Buscar
            </span>
            <span className="flex min-h-12 items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]">
              <Search
                className="size-4 shrink-0 text-zinc-400"
                aria-hidden="true"
              />
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Buscar evento o artista..."
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                className="min-w-0 flex-1 border-0 bg-transparent text-base text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-white dark:placeholder:text-zinc-500"
              />
            </span>
          </label>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Categoría
            </p>
            <div
              className="grid grid-cols-2 gap-2.5"
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
                    onClick={() => {
                      onCategoryChange(item.id)
                      onTagChange(null)
                    }}
                    className={cn(
                      "flex min-h-14 items-center gap-2.5 rounded-2xl border px-3.5 py-3 text-left text-sm font-medium transition",
                      active
                        ? "border-violet-500/50 bg-violet-500/10 text-violet-800 dark:border-violet-400/40 dark:bg-violet-500/15 dark:text-violet-100"
                        : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.06]",
                    )}
                  >
                    <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
                    <span className="leading-snug">{item.label}</span>
                  </button>
                )
              })}
            </div>

            {subTags.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto pb-1 pt-1 scrollbar-none">
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
                          ? "border-violet-500/50 bg-violet-600 text-white dark:bg-violet-500"
                          : "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300",
                      )}
                    >
                      {tag.label}
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Ubicación
            </p>
            {locationsLoading && cities.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Cargando provincias…
              </p>
            ) : (
              <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto pb-1">
                <LocationChip
                  active={city === "todas"}
                  label="Todas las ubicaciones"
                  onClick={() => onCityChange("todas")}
                />
                {cities.map((item) => (
                  <LocationChip
                    key={item}
                    active={city.toLowerCase() === item.toLowerCase()}
                    label={item}
                    onClick={() => onCityChange(item)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 border-t border-zinc-200/80 bg-white/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md dark:border-white/10 dark:bg-zinc-950/95">
          <button
            type="button"
            onClick={() => {
              onApply()
              onOpenChange(false)
            }}
            className={cn(
              "flex h-12 w-full items-center justify-center rounded-2xl text-base font-semibold text-white",
              "bg-gradient-to-r from-violet-600 to-fuchsia-600",
              "shadow-sm transition hover:from-violet-500 hover:to-fuchsia-500 hover:shadow-md",
              "active:scale-[0.99]",
            )}
          >
            {countLabel}
          </button>
        </div>
      </SheetContent>
    </Sheet>
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
          : "border-zinc-200 bg-white text-zinc-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300",
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
