"use client"

import type { ReactNode } from "react"

import { AppTakeover } from "@/components/ui/app-takeover"
import { cn } from "@/lib/utils"

export function ImmersiveCheckoutShell({
  map,
  list,
  view = "map",
  toolbar,
  panel,
  paying = false,
  onDismissPay,
}: {
  map: ReactNode
  list?: ReactNode
  view?: "map" | "list"
  toolbar?: ReactNode
  panel: ReactNode
  paying?: boolean
  onDismissPay?: () => void
}) {
  const showList = view === "list" && Boolean(list)

  return (
    <AppTakeover className="md:flex-row">
      <div className="relative flex h-[45dvh] w-full flex-shrink-0 flex-col md:h-full md:flex-1">
        {toolbar ? (
          <div className="hidden shrink-0 border-b border-border bg-background px-3 py-2 md:block">
            {toolbar}
          </div>
        ) : null}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {showList ? list : map}
          <button
            type="button"
            tabIndex={paying ? 0 : -1}
            aria-label="Volver a la selección"
            onClick={onDismissPay}
            className={cn(
              "absolute inset-0 z-20 bg-black/80 backdrop-blur-md transition-opacity duration-500 ease-in-out",
              paying ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          />
        </div>
      </div>

      <div
        className={cn(
          "z-20 flex h-[55dvh] w-full flex-col overflow-hidden rounded-t-2xl border-t border-border bg-card",
          "shadow-[0_-10px_40px_rgba(0,0,0,0.5)]",
          "md:h-full md:w-[400px] md:flex-none md:rounded-none md:border-l md:border-t-0 md:shadow-none",
          "xl:w-[450px]",
        )}
      >
        {panel}
      </div>
    </AppTakeover>
  )
}
