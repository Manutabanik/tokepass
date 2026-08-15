"use client"

import { List, Map } from "lucide-react"

import { cn } from "@/lib/utils"
import type { StorefrontViewMode } from "@/lib/stores/storefront-seat-store"

const OPTIONS: Array<{
  id: StorefrontViewMode
  label: string
  icon: typeof Map
}> = [
  { id: "map", label: "Mapa", icon: Map },
  { id: "list", label: "Lista", icon: List },
]

export function StorefrontViewToggle({
  value,
  onChange,
  className,
  compact = false,
}: {
  value: StorefrontViewMode
  onChange: (view: StorefrontViewMode) => void
  className?: string
  compact?: boolean
}) {
  return (
    <div
      role="tablist"
      aria-label="Modo de selección de ubicaciones"
      className={cn(
        "inline-grid grid-cols-2 rounded-lg bg-muted/90 p-0.5 ring-1 ring-border backdrop-blur",
        compact ? "gap-0" : "gap-0.5",
        className,
      )}
    >
      {OPTIONS.map((option) => {
        const Icon = option.icon
        const active = value === option.id
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.id)}
            className={cn(
              "inline-flex items-center justify-center gap-1 rounded-md font-semibold transition-colors",
              compact
                ? "h-7 min-w-[4.25rem] px-2 text-[11px]"
                : "min-h-9 px-2.5 text-xs",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className={cn("shrink-0", compact ? "size-3" : "size-3.5")} aria-hidden="true" />
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
