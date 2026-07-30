"use client"

import { ArrowRight, MapPin, Search } from "lucide-react"
import { motion } from "motion/react"
import type { FormEvent } from "react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

type SearchBarProps = {
  query: string
  onQueryChange: (value: string) => void
  city: string
  cities: string[]
  onCityChange: (value: string) => void
}

function CitySelect({
  city,
  cities,
  onCityChange,
  triggerClassName,
}: {
  city: string
  cities: string[]
  onCityChange: (value: string) => void
  triggerClassName?: string
}) {
  return (
    <div className="relative z-50 w-full min-w-0">
      <Select
        value={city}
        onValueChange={(value) => value && onCityChange(value)}
      >
        <SelectTrigger
          className={cn(
            "h-auto w-full min-w-0 justify-between shadow-none",
            "focus-visible:border-purple-500/40 focus-visible:ring-0",
            "dark:bg-transparent dark:hover:bg-white/10",
            triggerClassName,
          )}
        >
          <MapPin
            className="size-3.5 shrink-0 text-fuchsia-300 lg:size-4"
            aria-hidden="true"
          />
          <SelectValue placeholder="Ciudad" />
        </SelectTrigger>
        <SelectContent
          side="bottom"
          sideOffset={8}
          align="start"
          alignItemWithTrigger={false}
          className={cn(
            "z-50 max-h-56 w-[min(100vw-2rem,18rem)] overflow-y-auto",
            "rounded-xl border border-purple-500/30 bg-slate-900/95 text-zinc-100",
            "shadow-[0_10px_30px_rgba(0,0,0,0.9)] backdrop-blur-2xl",
          )}
        >
          <SelectItem value="todas">Todas las ciudades</SelectItem>
          {cities.map((item) => (
            <SelectItem key={item} value={item.toLowerCase()}>
              {item}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function SearchBar({
  query,
  onQueryChange,
  city,
  cities,
  onCityChange,
}: SearchBarProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    document.getElementById("discovery-results")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.08, ease: "easeOut" }}
      className="mx-auto w-full max-w-4xl px-4 lg:px-0"
    >
      {/* Mobile / tablet */}
      <form
        onSubmit={handleSubmit}
        className={cn(
          "block space-y-3.5 rounded-2xl border border-white/10 bg-slate-950/70 p-4 shadow-2xl backdrop-blur-2xl",
          "transition-colors hover:border-purple-500/40",
          "lg:hidden",
        )}
      >
        <label className="relative flex w-full items-center gap-3 rounded-xl bg-white/[0.03] px-4 py-3">
          <span className="sr-only">Buscar eventos</span>
          <Search
            className="size-4 shrink-0 text-violet-300"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Buscar fiestas, DJs, boliches..."
            className="min-w-0 flex-1 border-0 bg-transparent text-sm font-medium text-white outline-none placeholder:text-slate-500 focus:ring-0"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <CitySelect
            city={city}
            cities={cities}
            onCityChange={onCityChange}
            triggerClassName="rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-xs font-medium text-slate-200 hover:bg-white/10 sm:text-sm"
          />
          <button
            type="submit"
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-bold text-white sm:text-sm",
              "bg-gradient-to-r from-purple-600 to-fuchsia-600",
              "shadow-[0_0_20px_rgba(168,85,247,0.4)]",
              "transition-transform active:scale-95",
              "hover:from-purple-500 hover:to-fuchsia-500",
            )}
          >
            Explorar
            <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
          </button>
        </div>
      </form>

      {/* Desktop lg+ */}
      <form
        onSubmit={handleSubmit}
        className={cn(
          "mx-auto hidden max-w-4xl items-center gap-2 rounded-full border border-white/10 bg-slate-950/70 p-2.5 shadow-2xl backdrop-blur-2xl",
          "transition-colors hover:border-purple-500/40",
          "lg:flex",
        )}
      >
        <label className="relative flex min-w-0 basis-[60%] items-center gap-3 px-4 py-3">
          <span className="sr-only">Buscar eventos</span>
          <Search
            className="size-4 shrink-0 text-violet-300"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Buscar fiestas, DJs, boliches..."
            className="min-w-0 flex-1 border-0 bg-transparent text-sm font-medium text-white outline-none placeholder:text-slate-500 focus:ring-0"
          />
        </label>

        <span className="h-6 w-px shrink-0 bg-white/10" aria-hidden="true" />

        <div className="basis-[20%] shrink-0">
          <CitySelect
            city={city}
            cities={cities}
            onCityChange={onCityChange}
            triggerClassName="h-12 w-full rounded-full border-0 bg-transparent px-3.5 text-sm font-medium text-slate-200 hover:bg-white/5"
          />
        </div>

        <button
          type="submit"
          className={cn(
            "inline-flex h-12 basis-[20%] shrink-0 items-center justify-center gap-2 rounded-full px-5 text-sm font-bold text-white",
            "bg-gradient-to-r from-purple-600 to-fuchsia-600",
            "shadow-[0_0_20px_rgba(168,85,247,0.4)]",
            "transition-transform active:scale-95",
            "hover:from-purple-500 hover:to-fuchsia-500",
          )}
        >
          Explorar
          <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
        </button>
      </form>
    </motion.div>
  )
}
