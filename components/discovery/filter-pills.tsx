"use client"

import {
  Clapperboard,
  Disc3,
  Mic2,
  Sparkles,
  Trophy,
} from "lucide-react"

import type { DiscoveryMoodId } from "@/lib/discovery-filters"
import { DISCOVERY_MOODS } from "@/lib/discovery-filters"
import { cn } from "@/lib/utils"

const MOOD_ICONS: Record<DiscoveryMoodId, typeof Sparkles> = {
  all: Sparkles,
  fiestas: Disc3,
  recitales: Mic2,
  teatro: Clapperboard,
  deportes: Trophy,
}

type FilterPillsProps = {
  mood: DiscoveryMoodId
  onMoodChange: (value: DiscoveryMoodId) => void
}

export function FilterPills({ mood, onMoodChange }: FilterPillsProps) {
  return (
    <div className="w-full" role="tablist" aria-label="Categorías">
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none sm:flex-wrap sm:overflow-visible">
        {DISCOVERY_MOODS.map((item) => {
          const Icon = MOOD_ICONS[item.id]
          const active = mood === item.id
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onMoodChange(item.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all",
                active
                  ? "border border-purple-500/30 bg-purple-600/15 text-purple-700 dark:bg-purple-600/20 dark:text-purple-300"
                  : "border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 dark:border-white/10 dark:bg-transparent dark:text-zinc-400 dark:hover:border-white/20 dark:hover:text-zinc-200",
              )}
            >
              <Icon className="size-3.5 shrink-0" aria-hidden="true" />
              {item.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
