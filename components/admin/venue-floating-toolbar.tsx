"use client"

import {
  Grid3x3,
  GripVertical,
  HandGrab,
  MousePointer2,
  PenTool,
} from "lucide-react"
import { motion, useDragControls } from "motion/react"
import { type PointerEvent, type RefObject } from "react"

import { cn } from "@/lib/utils"

export type FloatingDrawTool = "select" | "pan" | "polygon" | "matrix"

const TOOLS: Array<{
  id: FloatingDrawTool
  label: string
  icon: typeof MousePointer2
}> = [
  { id: "select", label: "Selección", icon: MousePointer2 },
  { id: "pan", label: "Mover mapa", icon: HandGrab },
  { id: "polygon", label: "Dibujar zona", icon: PenTool },
  {
    id: "matrix",
    label: "Matriz de elementos: arrastrá para dibujar el área",
    icon: Grid3x3,
  },
]

function stopCanvas(event: PointerEvent<HTMLElement>) {
  event.stopPropagation()
}

export function VenueFloatingToolbar({
  active,
  onChange,
  constraintRef,
  className,
  geometryLocked = false,
}: {
  active: FloatingDrawTool
  onChange: (tool: FloatingDrawTool) => void
  constraintRef?: RefObject<HTMLElement | null>
  className?: string
  geometryLocked?: boolean
}) {
  const dragControls = useDragControls()
  const visibleTools = geometryLocked
    ? TOOLS.filter((item) => item.id === "select" || item.id === "pan")
    : TOOLS

  return (
    <motion.div
      role="toolbar"
      aria-label="Modos de cursor"
      drag
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      dragConstraints={constraintRef}
      onPointerDown={stopCanvas}
      data-editor-chrome
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

      {visibleTools.map((item) => {
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
    </motion.div>
  )
}
