"use client"

import { Map, Sparkles } from "lucide-react"

import { cn } from "@/lib/utils"
import type { StorefrontViewMode } from "@/lib/stores/storefront-seat-store"

const OPTIONS: Array<{
  id: StorefrontViewMode
  title: string
  description: string
  icon: typeof Map
}> = [
  {
    id: "map",
    title: "Elegir en el Mapa",
    description:
      "Navegá por el plano interactivo y tocá exactamente las mesas o butacas que querés.",
    icon: Map,
  },
  {
    id: "list",
    title: "Búsqueda Rápida",
    description:
      "Elegí la zona y la cantidad. Te asignamos los mejores lugares juntos automáticamente.",
    icon: Sparkles,
  },
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
    <div className={cn(compact ? "space-y-3" : "space-y-4", className)}>
      <h3 className={cn("font-semibold", compact ? "text-base" : "text-lg")}>
        ¿Cómo preferís elegir tus lugares?
      </h3>
      <div
        role="radiogroup"
        aria-label="Cómo preferís elegir tus lugares"
        className={cn(
          "grid grid-cols-1 gap-3",
          compact ? "gap-2" : "md:grid-cols-2",
        )}
      >
        {OPTIONS.map((option) => {
          const Icon = option.icon
          const active = value === option.id
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option.id)}
              className={cn(
                "rounded-xl text-left shadow-sm transition-all",
                compact ? "min-h-0 p-3" : "min-h-[100px] p-4",
                active
                  ? "border-2 border-primary bg-primary/10 opacity-100"
                  : "border border-border bg-card opacity-70 hover:opacity-100",
              )}
            >
              <span className="flex items-start gap-3">
                <span
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-lg",
                    active
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-base font-semibold text-foreground">
                    {option.title}
                  </span>
                  <span
                    className={cn(
                      "mt-1 block text-sm leading-5 text-muted-foreground",
                      compact && "line-clamp-2",
                    )}
                  >
                    {option.description}
                  </span>
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
