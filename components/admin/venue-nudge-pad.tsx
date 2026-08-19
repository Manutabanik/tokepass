"use client"

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const KEYS = [
  {
    dx: 0,
    dy: -1,
    label: "Mover arriba",
    icon: ChevronUp,
    className: "col-start-2 row-start-1",
  },
  {
    dx: -1,
    dy: 0,
    label: "Mover izquierda",
    icon: ChevronLeft,
    className: "col-start-1 row-start-2",
  },
  {
    dx: 1,
    dy: 0,
    label: "Mover derecha",
    icon: ChevronRight,
    className: "col-start-3 row-start-2",
  },
  {
    dx: 0,
    dy: 1,
    label: "Mover abajo",
    icon: ChevronDown,
    className: "col-start-2 row-start-3",
  },
] as const

export function VenueNudgePad({
  onNudge,
  className,
}: {
  onNudge: (dx: number, dy: number) => void
  className?: string
}) {
  return (
    <div
      className={cn(
        "pointer-events-auto grid w-[7.5rem] grid-cols-3 grid-rows-3 gap-1 rounded-2xl border border-border bg-card/95 p-1.5 shadow-xl backdrop-blur-md",
        className,
      )}
      role="group"
      aria-label="Micromovimiento"
    >
      {KEYS.map((key) => {
        const Icon = key.icon
        return (
          <Button
            key={key.label}
            type="button"
            variant="secondary"
            size="icon-lg"
            className={cn("size-11 touch-manipulation", key.className)}
            aria-label={key.label}
            onClick={(event) => {
              event.stopPropagation()
              onNudge(key.dx, key.dy)
            }}
          >
            <Icon className="size-5" />
          </Button>
        )
      })}
    </div>
  )
}
