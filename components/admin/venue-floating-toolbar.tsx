"use client"

import {
  Armchair,
  CircleDot,
  MousePointer2,
  PenTool,
  Plus,
} from "lucide-react"

import type { PalettePlacement } from "@/components/admin/venue-component-palette"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export type FloatingDrawTool = "select" | "polygon" | "seat" | "table"

const TOOLS: Array<{
  id: FloatingDrawTool
  label: string
  icon: typeof MousePointer2
}> = [
  { id: "select", label: "Cursor", icon: MousePointer2 },
  { id: "polygon", label: "Lápiz de zonas", icon: PenTool },
  { id: "seat", label: "Asiento", icon: Armchair },
  { id: "table", label: "Mesa", icon: CircleDot },
]

const EXTRA_PLACEMENTS: Array<{ label: string; placement: PalettePlacement }> = [
  { label: "Bloque de butacas", placement: { kind: "seat_block" } },
  { label: "Matriz filas × columnas", placement: { kind: "grid_array" } },
  { label: "Graderías en arco", placement: { kind: "rings" } },
  { label: "Campo / pista", placement: { kind: "element", type: "standing_zone" } },
  { label: "Box VIP", placement: { kind: "element", type: "vip_box" } },
  {
    label: "Escenario",
    placement: { kind: "element", type: "infrastructure", subtype: "stage" },
  },
]

export function VenueFloatingToolbar({
  active,
  onChange,
  onPlace,
  className,
}: {
  active: FloatingDrawTool
  onChange: (tool: FloatingDrawTool) => void
  onPlace?: (placement: PalettePlacement) => void
  className?: string
}) {
  return (
    <div
      role="toolbar"
      aria-label="Herramientas de dibujo"
      className={cn(
        "absolute top-4 left-1/2 z-40 flex -translate-x-1/2 gap-2 rounded-full bg-zinc-900 px-4 py-2 text-white shadow-2xl",
        className,
      )}
    >
      {TOOLS.map((item) => {
        const Icon = item.icon
        const selected = active === item.id
        return (
          <button
            key={item.id}
            type="button"
            title={item.label}
            aria-label={item.label}
            aria-pressed={selected}
            onClick={() => onChange(item.id)}
            className={cn(
              "inline-flex size-9 items-center justify-center rounded-full transition-colors",
              selected
                ? "bg-white text-zinc-950 shadow-sm"
                : "text-zinc-300 hover:bg-zinc-800 hover:text-white",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            <span className="sr-only">{item.label}</span>
          </button>
        )
      })}
      {onPlace ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex size-9 items-center justify-center rounded-full text-zinc-300 hover:bg-zinc-800 hover:text-white"
            aria-label="Más elementos"
            title="Más elementos"
          >
            <Plus className="size-4" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="min-w-52">
            {EXTRA_PLACEMENTS.map((item) => (
              <DropdownMenuItem
                key={item.label}
                onClick={() => onPlace(item.placement)}
              >
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}
