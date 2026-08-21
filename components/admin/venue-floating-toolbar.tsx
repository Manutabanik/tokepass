"use client"

import {
  Armchair,
  CircleDot,
  GripVertical,
  HandGrab,
  Minus,
  MousePointer2,
  PenTool,
  Plus,
  Sparkles,
  Square,
  Type,
  Users,
} from "lucide-react"
import { motion, useDragControls } from "motion/react"
import { useState, type PointerEvent, type RefObject } from "react"

import type { PalettePlacement } from "@/components/admin/venue-component-palette"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export type FloatingDrawTool = "select" | "pan" | "polygon" | "seat" | "table"

const TOOLS: Array<{
  id: FloatingDrawTool
  label: string
  icon: typeof MousePointer2
}> = [
  { id: "select", label: "Cursor", icon: MousePointer2 },
  { id: "pan", label: "Mover mapa", icon: HandGrab },
  { id: "polygon", label: "Lapiz de zonas", icon: PenTool },
  { id: "seat", label: "Asiento", icon: Armchair },
  { id: "table", label: "Mesa", icon: CircleDot },
]

const PLUS_PLACEMENTS: Array<{ label: string; placement: PalettePlacement }> = [
  { label: "Silla", placement: { kind: "element", type: "vip_chair" } },
  { label: "Mesa redonda", placement: { kind: "element", type: "round_table" } },
  {
    label: "Mesa rectangular",
    placement: { kind: "element", type: "long_table" },
  },
  {
    label: "Sector de campo",
    placement: { kind: "element", type: "standing_zone" },
  },
  {
    label: "Escenario",
    placement: { kind: "element", type: "infrastructure", subtype: "stage" },
  },
  { label: "Texto", placement: { kind: "label" } },
]

function stopCanvas(event: PointerEvent<HTMLElement>) {
  event.stopPropagation()
}

export function VenueFloatingToolbar({
  active,
  onChange,
  onPlace,
  constraintRef,
  className,
  zoomPercent,
  onZoomIn,
  onZoomOut,
}: {
  active: FloatingDrawTool
  onChange: (tool: FloatingDrawTool) => void
  onPlace?: (placement: PalettePlacement) => void
  constraintRef?: RefObject<HTMLElement | null>
  className?: string
  zoomPercent?: number
  onZoomIn?: () => void
  onZoomOut?: () => void
}) {
  const dragControls = useDragControls()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <motion.div
      role="toolbar"
      aria-label="Herramientas de dibujo"
      drag
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      dragConstraints={constraintRef}
      onPointerDown={stopCanvas}
      className={cn(
        "absolute top-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-card/90 p-2 text-foreground shadow-2xl backdrop-blur-md",
        className,
      )}
    >
      <button
        type="button"
        aria-label="Mover barra de herramientas"
        className="cursor-grab px-1 text-muted-foreground active:cursor-grabbing"
        onPointerDown={(event) => {
          event.stopPropagation()
          dragControls.start(event)
        }}
      >
        <GripVertical className="size-4" aria-hidden="true" />
      </button>

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
            onPointerDown={stopCanvas}
            onClick={(event) => {
              event.stopPropagation()
              onChange(item.id)
            }}
            className={cn(
              "inline-flex size-9 items-center justify-center rounded-full transition-colors",
              selected
                ? "bg-foreground text-background shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            <span className="sr-only">{item.label}</span>
          </button>
        )
      })}

      {onPlace ? (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger
            className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Agregar elemento"
            title="Agregar elemento"
            onPointerDown={stopCanvas}
            onClick={(event) => event.stopPropagation()}
          >
            <Plus className="size-4" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="center"
            className="min-w-52"
            onPointerDown={stopCanvas}
          >
            {PLUS_PLACEMENTS.map((item) => {
              const Icon =
                item.placement.kind === "element" &&
                item.placement.type === "vip_chair"
                  ? Armchair
                  : item.placement.kind === "element" &&
                      item.placement.type === "round_table"
                    ? CircleDot
                    : item.placement.kind === "element" &&
                        item.placement.type === "long_table"
                      ? Square
                      : item.placement.kind === "element" &&
                          item.placement.type === "standing_zone"
                        ? Users
                        : item.placement.kind === "label"
                          ? Type
                          : Sparkles
              return (
                <DropdownMenuItem
                  key={item.label}
                  onClick={(event) => {
                    event.stopPropagation()
                    onPlace(item.placement)
                    setMenuOpen(false)
                  }}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {item.label}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {onZoomIn && onZoomOut ? (
        <span className="ml-1 inline-flex items-center gap-0.5 border-l border-border pl-2">
          <button
            type="button"
            title="Alejar"
            aria-label="Alejar"
            onPointerDown={stopCanvas}
            onClick={(event) => {
              event.stopPropagation()
              onZoomOut()
            }}
            className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Minus className="size-4" aria-hidden="true" />
          </button>
          <span className="min-w-10 text-center text-[11px] tabular-nums text-muted-foreground">
            {zoomPercent ?? 100}%
          </span>
          <button
            type="button"
            title="Acercar"
            aria-label="Acercar"
            onPointerDown={stopCanvas}
            onClick={(event) => {
              event.stopPropagation()
              onZoomIn()
            }}
            className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Plus className="size-4" aria-hidden="true" />
          </button>
        </span>
      ) : null}
    </motion.div>
  )
}
