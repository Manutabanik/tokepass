"use client"

import type { ReactNode } from "react"
import { Flashlight, FlashlightOff, Search, Sun } from "lucide-react"

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
  torchSupported,
  wakeLockHeld = false,
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
  /** False only after hardware proves torch is unavailable. */
  torchSupported: boolean
  wakeLockHeld?: boolean
  camera: ReactNode
  overlay?: ReactNode
  onChangeGate: () => void
  onSearch: () => void
  onToggleTorch: () => void
}) {
  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* Live camera as full-bleed background — never unmounted by chrome. */}
      <div
        data-gate-scanner
        className="absolute inset-0 overflow-hidden bg-zinc-950"
      >
        {camera}
        {!isTotem ? <NeonFocusFrame /> : null}
        {overlay}
      </div>

      {/* Top controls stay above the scan-result flash (camera-local overlay). */}
      <header className="relative z-30 shrink-0 space-y-2 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-black/50 px-3 py-2 backdrop-blur-md">
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
            {wakeLockHeld ? (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-200/80"
                title="Pantalla encendida"
              >
                <Sun className="size-3.5" aria-hidden="true" />
                <span className="sr-only">Pantalla sin bloqueo</span>
              </span>
            ) : null}
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
            className="flex min-h-12 w-full items-center gap-2 rounded-2xl border border-white/15 bg-black/50 px-4 text-left text-sm font-semibold text-white shadow-lg backdrop-blur-md"
          >
            <Search className="size-4 shrink-0 text-white/80" aria-hidden="true" />
            Buscar por DNI, nombre o codigo
          </button>
        ) : null}
      </header>

      <div className="relative z-0 min-h-0 flex-1" aria-hidden="true" />

      {!isTotem ? (
        <div className="relative z-30 flex shrink-0 items-center justify-between gap-3 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <button
            type="button"
            onClick={onToggleTorch}
            disabled={!torchSupported}
            aria-label={
              !torchSupported
                ? "Linterna no disponible en este dispositivo"
                : torchOn
                  ? "Apagar linterna"
                  : "Encender linterna"
            }
            title={
              !torchSupported
                ? "Este dispositivo no soporta linterna"
                : undefined
            }
            className="grid size-14 place-items-center rounded-full bg-black/50 text-white ring-1 ring-white/15 backdrop-blur-md disabled:opacity-35"
          >
            {torchOn ? (
              <Flashlight className="size-6" aria-hidden="true" />
            ) : (
              <FlashlightOff className="size-6" aria-hidden="true" />
            )}
          </button>
          <p className="rounded-full bg-black/50 px-4 py-2 font-mono text-2xl font-black tabular-nums tracking-tight backdrop-blur-md">
            {admittedCount}
            <span className="ml-2 text-sm font-semibold uppercase tracking-[0.14em] text-white/50">
              Ingresados
            </span>
          </p>
          <button
            type="button"
            onClick={onSearch}
            aria-label="Buscar por DNI, nombre o codigo"
            className="grid size-14 place-items-center rounded-full bg-black/50 text-white ring-1 ring-white/15 backdrop-blur-md"
          >
            <Search className="size-6" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className="relative z-30 flex shrink-0 justify-center px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <p className="rounded-full bg-black/50 px-4 py-2 font-mono text-lg font-black tabular-nums text-white/70 backdrop-blur-md">
            {admittedCount} ingresados
          </p>
        </div>
      )}
    </div>
  )
}
