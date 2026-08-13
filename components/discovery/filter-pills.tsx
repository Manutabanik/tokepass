"use client"

import { Sparkles } from "lucide-react"

import { resolveCategoryIcon } from "@/lib/category-icons"
import {
  DEFAULT_DISCOVERY_CATEGORIES,
  type DiscoveryCategory,
} from "@/lib/discovery-categories"
import { cn } from "@/lib/utils"

type FilterPillsProps = {
  categoryId: string
  onCategoryChange: (value: string) => void
  categories?: DiscoveryCategory[]
  className?: string
}

/** Chips horizontales opcionales — consumen el mismo array que el buscador. */
export function FilterPills({
  categoryId,
  onCategoryChange,
  categories = DEFAULT_DISCOVERY_CATEGORIES,
  className,
}: FilterPillsProps) {
  return (
    <div
      className={cn("w-full", className)}
      role="tablist"
      aria-label="Categorías"
    >
      <div className="flex justify-start gap-2 overflow-x-auto px-4 pb-1 scrollbar-none sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0">
        {categories.map((item) => {
          const Icon = resolveCategoryIcon(item.iconName ?? item.icon) ?? Sparkles
          const active = categoryId === item.id
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onCategoryChange(item.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-all",
                active
                  ? cn(
                      "border border-transparent text-white",
                      "bg-gradient-to-r from-violet-600 to-fuchsia-600",
                      "shadow-sm",
                    )
                  : cn(
                      "border border-zinc-200/90 bg-white/70 text-zinc-600",
                      "hover:border-violet-300 hover:text-zinc-900",
                      "dark:border-white/12 dark:bg-white/[0.04] dark:text-zinc-300",
                      "dark:hover:border-white/25 dark:hover:bg-white/[0.07] dark:hover:text-white",
                    ),
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
