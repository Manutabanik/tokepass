"use client"

import {
  Flame,
  Mic2,
  Music2,
  Sparkles,
  Tent,
  Zap,
} from "lucide-react"
import { motion } from "motion/react"

import type { DiscoveryMoodId } from "@/lib/discovery-filters"
import { DISCOVERY_MOODS } from "@/lib/discovery-filters"
import { cn } from "@/lib/utils"

const MOOD_ICONS: Record<DiscoveryMoodId, typeof Flame> = {
  all: Sparkles,
  tonight: Zap,
  cachengue: Flame,
  electronica: Music2,
  festivales: Tent,
  recitales: Mic2,
}

type FilterPillsProps = {
  mood: DiscoveryMoodId
  onMoodChange: (value: DiscoveryMoodId) => void
}

function MoodButton({
  item,
  active,
  onSelect,
}: {
  item: (typeof DISCOVERY_MOODS)[number]
  active: boolean
  onSelect: () => void
}) {
  const Icon = MOOD_ICONS[item.id]
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-full px-5 py-2.5 text-sm transition-colors",
        active
          ? "bg-gradient-to-r from-purple-600 to-fuchsia-600 font-semibold text-white shadow-[0_0_20px_rgba(192,38,211,0.5)]"
          : "border border-white/10 bg-white/5 font-medium text-slate-300 backdrop-blur-md hover:bg-white/10",
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {item.label}
    </button>
  )
}

export function FilterPills({ mood, onMoodChange }: FilterPillsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.14, ease: "easeOut" }}
      className="relative z-10 w-full"
    >
      {/* Desktop: todas visibles, centradas */}
      <div
        className="mx-auto my-6 hidden max-w-5xl flex-wrap items-center justify-center gap-3 lg:flex"
        role="tablist"
        aria-label="Selector de vibra"
      >
        {DISCOVERY_MOODS.map((item) => (
          <MoodButton
            key={item.id}
            item={item}
            active={mood === item.id}
            onSelect={() => onMoodChange(item.id)}
          />
        ))}
      </div>

      {/* Mobile: carrusel táctil con fade mask */}
      <div className="tokepass-pills-mask my-4 flex w-full lg:hidden">
        <div
          className="flex w-full scroll-smooth items-center gap-2.5 overflow-x-auto px-4 py-2 scrollbar-none"
          role="tablist"
          aria-label="Selector de vibra"
        >
          {DISCOVERY_MOODS.map((item) => (
            <MoodButton
              key={item.id}
              item={item}
              active={mood === item.id}
              onSelect={() => onMoodChange(item.id)}
            />
          ))}
        </div>
      </div>
    </motion.div>
  )
}
