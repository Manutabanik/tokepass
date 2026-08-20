"use client"

import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export function VenueEditorShell({
  headerLeft,
  headerCenter,
  headerRight,
  palette,
  canvas,
  inspector,
  className,
}: {
  headerLeft: ReactNode
  headerCenter: ReactNode
  headerRight: ReactNode
  palette: ReactNode
  canvas: ReactNode
  inspector: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex h-[100dvh] w-screen flex-col overflow-hidden bg-background text-foreground",
        className,
      )}
    >
      <header className="z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-3 text-card-foreground">
        <div className="flex min-w-0 flex-1 items-center gap-2">{headerLeft}</div>
        <div className="hidden min-w-0 flex-[1.2] justify-center lg:flex">
          {headerCenter}
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
          {headerRight}
        </div>
      </header>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="hidden h-full w-72 shrink-0 border-r border-border bg-card lg:flex">
          {palette}
        </aside>
        <section className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
          {canvas}
        </section>
        <aside className="hidden h-full w-80 shrink-0 border-l border-border bg-card lg:flex">
          {inspector}
        </aside>
      </div>
    </div>
  )
}
