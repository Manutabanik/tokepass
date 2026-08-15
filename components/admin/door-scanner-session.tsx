"use client"

import type { ReactNode } from "react"
import { Flashlight, FlashlightOff, Search } from "lucide-react"

import { cn } from "@/lib/utils"

export function NeonFocusFrame() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-[7%] rounded-[2rem]"
    >
      <span className="absolute left-0 top-0 h-10 w-10 rounded-tl-3xl border-l-[3px] border-t-[3px] border-fuchsia-400 shadow-[0_0_18px_rgba(232,121,249,0.65)]" />
      <span className="absolute right-0 top-0 h-10 w-10 rounded-tr-3xl border-r-[3px] border-t-[3px] border-fuchsia-400 shadow-[0_0_18px_rgba(232,121,249,0.65)]" />
      <span className="absolute bottom-0 left-0 h-10 w-10 rounded-bl-3xl border-b-[3px] border-l-[3px] border-cyan-400 shadow-[0_0_18px_rgba(34,211,238,0.55)]" />
      <span className="absolute bottom-0 right-0 h-10 w-10 rounded-br-3xl border-b-[3px] border-r-[3px] border-cyan-400 shadow-[0_0_18px_rgba(34,211,238,0.55)]" />
    </div>
  )
}

export function DoorScannerSessionChrome({
  isTotem,
  gateLabel,
  online,
  admittedCount,
  torchOn,
  torchAvailable,
  camera,
  overlay,
  onChangeGate,
  onSearch,
  onToggleTorch,
}: {
  isTotem: boolean
  gateLabel: string
  online: boolean
  admittedCount: number
  torchOn: boolean
  torchAvailable: boolean
  camera: ReactNode
  overlay?: ReactNode
  onChangeGate: () => void
  onSearch: () => void
  onToggleTorch: () => void
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 space-y-2 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                online ? "bg-emerald-500" : "bg-amber-500",
              )}
              aria-label={online ? "Conectado" : "Modo Offline"}
            />
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
              {gateLabel}
            </p>
          </div>
          {!isTotem ? (
            <button
              type="button"
              onClick={onChangeGate}
              className="shrink-0 text-[11px] font-bold uppercase tracking-[0.12em] text-fuchsia-300"
            >
              Cambiar gatera
            </button>
          ) : null}
        </div>
        {!isTotem ? (
          <button
            type="button"
            onClick={onSearch}
            className="flex min-h-12 w-full items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 text-left text-sm font-semibold text-white/80"
          >
            <Search className="size-4 shrink-0" aria-hidden="true" />
            Buscar por DNI o Nombre
          </button>
        ) : null}
      </header>

      <div
        data-gate-scanner
        className="relative mx-3 min-h-0 flex-[0.85] overflow-hidden rounded-[1.6rem] bg-zinc-950"
      >
        {camera}
        {!isTotem ? <NeonFocusFrame /> : null}
        {overlay}
      </div>

      {!isTotem ? (
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <button
            type="button"
            onClick={onToggleTorch}
            disabled={!torchAvailable}
            aria-label={torchOn ? "Apagar linterna" : "Encender linterna"}
            className="grid size-14 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/15 disabled:opacity-35"
          >
            {torchOn ? (
              <Flashlight className="size-6" aria-hidden="true" />
            ) : (
              <FlashlightOff className="size-6" aria-hidden="true" />
            )}
          </button>
          <p className="font-mono text-2xl font-black tabular-nums tracking-tight">
            {admittedCount}
            <span className="ml-2 text-sm font-semibold uppercase tracking-[0.14em] text-white/50">
              Ingresados
            </span>
          </p>
          <button
            type="button"
            onClick={onSearch}
            aria-label="Buscar por DNI o nombre"
            className="grid size-14 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/15"
          >
            <Search className="size-6" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className="flex shrink-0 justify-center px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <p className="font-mono text-lg font-black tabular-nums text-white/70">
            {admittedCount} ingresados
          </p>
        </div>
      )}
    </div>
  )
}
