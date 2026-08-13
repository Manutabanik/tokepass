"use client"

import { ArrowRight, MapPin, Search, SlidersHorizontal } from "lucide-react"
import { motion } from "motion/react"
import { useMemo, useState, type FormEvent } from "react"

import {
  MobileFilterSheet,
  MobileSearchTrigger,
} from "@/components/discovery/mobile-filter-sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DEFAULT_DISCOVERY_CATEGORIES,
  findCategory,
  type DiscoveryCategory,
} from "@/lib/discovery-categories"
import { cn } from "@/lib/utils"

type SearchBarProps = {
  query: string
  onQueryChange: (value: string) => void
  city: string
  cities: string[]
  onCityChange: (value: string) => void
  categoryId: string
  onCategoryChange: (value: string) => void
  tagId: string | null
  onTagChange: (value: string | null) => void
  categories?: DiscoveryCategory[]
  resultCount: number
}

function scrollToResults() {
  document.getElementById("discovery-results")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  })
}

export function SearchBar({
  query,
  onQueryChange,
  city,
  cities,
  onCityChange,
  categoryId,
  onCategoryChange,
  tagId,
  onTagChange,
  categories = DEFAULT_DISCOVERY_CATEGORIES,
  resultCount,
}: SearchBarProps) {
  const [mobileOpen, setMobileOpen] = useState(false)

  const category = findCategory(categories, categoryId)
  const cityLabel =
    city === "todas"
      ? "Todo el país"
      : cities.find((item) => item.toLowerCase() === city) ?? city

  const mobileSummary = useMemo(() => {
    const parts = [
      category && category.id !== "all" ? category.label : null,
      city !== "todas" ? cityLabel : null,
      query.trim() || null,
    ].filter(Boolean)
    return parts.length ? parts.join(" · ") : "Buscar filtros"
  }, [category, city, cityLabel, query])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    scrollToResults()
  }

  const segmentDivider = (
    <span
      className="hidden h-8 w-px shrink-0 self-center bg-zinc-200 dark:bg-white/10 md:block"
      aria-hidden="true"
    />
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.08, ease: "easeOut" }}
      className="mx-auto w-full max-w-4xl px-4 lg:px-0"
    >
      <MobileSearchTrigger
        onClick={() => setMobileOpen(true)}
        summary={mobileSummary}
      />

      <MobileFilterSheet
        open={mobileOpen}
        onOpenChange={setMobileOpen}
        query={query}
        onQueryChange={onQueryChange}
        city={city}
        cities={cities}
        onCityChange={onCityChange}
        categoryId={categoryId}
        onCategoryChange={onCategoryChange}
        tagId={tagId}
        onTagChange={onTagChange}
        categories={categories}
        resultCount={resultCount}
        onApply={scrollToResults}
      />

      <form
        onSubmit={handleSubmit}
        className={cn(
          "mx-auto hidden items-stretch rounded-full border shadow-sm backdrop-blur-xl transition-shadow hover:shadow-md md:flex",
          "border-zinc-200/90 bg-white/90",
          "dark:border-white/12 dark:bg-zinc-950/75",
        )}
      >
        <label className="group relative flex min-w-0 flex-[1.4] cursor-text flex-col justify-center gap-0.5 rounded-l-full px-5 py-3 transition hover:bg-zinc-50 dark:hover:bg-white/[0.04]">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Buscar
          </span>
          <span className="flex items-center gap-2">
            <Search
              className="size-3.5 shrink-0 text-zinc-400"
              aria-hidden="true"
            />
            <span className="sr-only">Texto de búsqueda</span>
            <input
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Evento, artista…"
              className="min-w-0 flex-1 border-0 bg-transparent text-sm font-medium text-zinc-900 outline-none placeholder:text-zinc-400 focus:ring-0 dark:text-white dark:placeholder:text-zinc-500"
            />
          </span>
        </label>

        {segmentDivider}

        <div className="flex min-w-0 flex-1 flex-col justify-center px-2 py-2">
          <span className="px-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Ubicación
          </span>
          <Select
            value={city}
            onValueChange={(value) => value && onCityChange(value)}
          >
            <SelectTrigger
              className={cn(
                "h-auto w-full min-w-0 justify-start gap-2 rounded-full border-0 bg-transparent px-3 py-1.5 text-sm font-medium shadow-none",
                "text-zinc-800 hover:bg-zinc-50",
                "dark:text-zinc-100 dark:hover:bg-white/[0.04]",
                "focus-visible:ring-0",
              )}
              aria-label={`Ubicación: ${cityLabel}`}
            >
              <MapPin
                className="size-3.5 shrink-0 text-zinc-400"
                aria-hidden="true"
              />
              <SelectValue placeholder="Todo el país" />
            </SelectTrigger>
            <SelectContent
              side="bottom"
              sideOffset={10}
              align="start"
              className={cn(
                "z-50 max-h-56 w-[min(100vw-2rem,18rem)] overflow-y-auto rounded-xl shadow-md",
                "border border-zinc-200 bg-white text-zinc-900",
                "dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100",
              )}
            >
              <SelectItem value="todas">Todo el país</SelectItem>
              {cities.map((item) => (
                <SelectItem key={item} value={item.toLowerCase()}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {segmentDivider}

        <div className="flex min-w-0 flex-1 flex-col justify-center px-2 py-2">
          <span className="px-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Categoría
          </span>
          <Select
            value={categoryId}
            onValueChange={(value) => {
              if (!value) return
              onCategoryChange(value)
              onTagChange(null)
            }}
          >
            <SelectTrigger
              className={cn(
                "h-auto w-full min-w-0 justify-start gap-2 rounded-full border-0 bg-transparent px-3 py-1.5 text-sm font-medium shadow-none",
                "text-zinc-800 hover:bg-zinc-50",
                "dark:text-zinc-100 dark:hover:bg-white/[0.04]",
                "focus-visible:ring-0",
              )}
              aria-label={`Categoría: ${category?.label ?? "Todos"}`}
            >
              <SlidersHorizontal
                className="size-3.5 shrink-0 text-zinc-400"
                aria-hidden="true"
              />
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent
              side="bottom"
              sideOffset={10}
              align="start"
              className={cn(
                "z-50 max-h-56 w-[min(100vw-2rem,18rem)] overflow-y-auto rounded-xl shadow-md",
                "border border-zinc-200 bg-white text-zinc-900",
                "dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100",
              )}
            >
              {categories.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex shrink-0 items-center p-1.5 pl-1">
          <button
            type="submit"
            className={cn(
              "inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold text-white",
              "bg-gradient-to-r from-violet-600 to-fuchsia-600",
              "shadow-sm transition hover:from-violet-500 hover:to-fuchsia-500 hover:shadow-md",
              "active:scale-[0.98]",
            )}
          >
            Explorar
            <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
          </button>
        </div>
      </form>
    </motion.div>
  )
}
