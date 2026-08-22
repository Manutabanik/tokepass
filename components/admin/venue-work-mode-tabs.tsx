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
  { id: "indexing", label: "2. Numeración", short: "Numeración", icon: Hash },
  { id: "pricing", label: "3. Precios", short: "Precios", icon: CircleDollarSign },
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
  layout?: "tabs" | "stack" | "stepper"
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
                  ? "border-emerald-500/50 bg-emerald-500/10 text-zinc-100"
                  : "border-zinc-700 bg-zinc-800/50 text-zinc-400",
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
        className={cn(
          "h-9 w-auto min-w-0 justify-center gap-0 bg-zinc-100 p-0.5 text-muted-foreground dark:bg-zinc-900",
          layout === "stepper" && "h-9",
        )}
      >
        {MODES.map((mode, index) => {
          const Icon = mode.icon
          const stepper = layout === "stepper"
          return (
            <span key={mode.id} className="inline-flex items-center">
              {stepper && index > 0 ? (
                <span className="px-1 text-muted-foreground" aria-hidden="true">
                  ›
                </span>
              ) : null}
              <TabsTrigger
                value={mode.id}
                className={cn(
                  "h-8 shrink-0 gap-1 px-2.5 text-xs data-active:bg-background data-active:text-foreground",
                  stepper && "px-3 text-[13px] font-medium",
                )}
              >
                {stepper ? null : (
                  <Icon className="size-3.5" aria-hidden="true" />
                )}
                <span>{mode.label}</span>
              </TabsTrigger>
            </span>
          )
        })}
      </TabsList>
    </Tabs>
  )
}
