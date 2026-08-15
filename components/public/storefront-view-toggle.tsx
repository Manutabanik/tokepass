"use client"

import { List, Map } from "lucide-react"

import { cn } from "@/lib/utils"
import type { StorefrontViewMode } from "@/lib/stores/storefront-seat-store"

const OPTIONS: Array<{
  id: StorefrontViewMode
  label: string
  icon: typeof Map
}> = [
  { id: "map", label: "Vista Mapa", icon: Map },
  { id: "list", label: "Vista Lista", icon: List },
]

export function StorefrontViewToggle({
  value,
  onChange,
  className,
}: {
  value: StorefrontViewMode
  onChange: (view: StorefrontViewMode) => void
  className?: string
}) {
  return (
    <div
      role="tablist"
      aria-label="Modo de selección de ubicaciones"
      className={cn(
        "grid grid-cols-2 gap-1 rounded-xl bg-muted p-1",
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
              "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
