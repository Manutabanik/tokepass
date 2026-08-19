"use client"

import { Box, CircleDollarSign, Hash } from "lucide-react"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

export type VenueWorkMode = "architecture" | "indexing" | "pricing"

const MODES: Array<{
  id: VenueWorkMode
  label: string
  short: string
  icon: typeof Box
}> = [
  { id: "architecture", label: "1. Arquitectura", short: "Arquitectura", icon: Box },
  { id: "indexing", label: "2. Indexación", short: "Indexación", icon: Hash },
  { id: "pricing", label: "3. Tarifas", short: "Tarifas", icon: CircleDollarSign },
]

export function VenueWorkModeTabs({
  value,
  onChange,
  className,
  layout = "tabs",
}: {
  value: VenueWorkMode
  onChange: (mode: VenueWorkMode) => void
  className?: string
  layout?: "tabs" | "stack"
}) {
  if (layout === "stack") {
    return (
      <div
        className={cn("flex flex-col gap-2 p-4", className)}
        role="radiogroup"
        aria-label="Modo de trabajo"
      >
        {MODES.map((mode) => {
          const Icon = mode.icon
          const active = value === mode.id
          return (
            <button
              key={mode.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(mode.id)}
              className={cn(
                "flex min-h-12 items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium touch-manipulation",
                active
                  ? "border-emerald-500/50 bg-emerald-500/10 text-foreground"
                  : "border-border bg-background text-muted-foreground",
              )}
            >
              <Icon className="size-5 shrink-0" aria-hidden="true" />
              {mode.label}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        if (
          next === "architecture" ||
          next === "indexing" ||
          next === "pricing"
        ) {
          onChange(next)
        }
      }}
      className={cn("min-w-0 gap-0", className)}
    >
      <TabsList
        aria-label="Modo de trabajo"
        className="h-9 w-full min-w-0 justify-start gap-0.5 overflow-x-auto bg-muted p-0.5 sm:w-auto"
      >
        {MODES.map((mode) => {
          const Icon = mode.icon
          return (
            <TabsTrigger
              key={mode.id}
              value={mode.id}
              className="h-8 shrink-0 gap-1 px-2 text-[11px] sm:px-2.5 sm:text-xs"
            >
              <Icon className="size-3.5" aria-hidden="true" />
              <span className="hidden md:inline">{mode.label}</span>
              <span className="md:hidden">{mode.short}</span>
            </TabsTrigger>
          )
        })}
      </TabsList>
    </Tabs>
  )
}
