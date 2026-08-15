"use client"

import { LoaderCircle, Monitor, Smartphone } from "lucide-react"

import type { ScannerEventOption } from "@/app/actions/scanner"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ScannerAccessMode } from "@/lib/scanner/access-mode"
import type { ScannerGate } from "@/lib/scanner/gate"
import { cn } from "@/lib/utils"

export function DoorScannerSetup({
  events,
  eventId,
  gates,
  gateId,
  accessMode,
  loadError,
  isStarting,
  onEventChange,
  onGateChange,
  onModeChange,
  onStart,
}: {
  events: ScannerEventOption[]
  eventId: string
  gates: ScannerGate[]
  gateId: string
  accessMode: ScannerAccessMode
  loadError: string | null
  isStarting: boolean
  onEventChange: (id: string) => void
  onGateChange: (id: string) => void
  onModeChange: (mode: ScannerAccessMode) => void
  onStart: () => void
}) {
  const selectedEvent = events.find((event) => event.id === eventId) ?? null
  const selectedGate = gates.find((gate) => gate.id === gateId) ?? null
  const canStart = Boolean(eventId && gateId) && !isStarting

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-[#05050a] text-white">
      <div className="mx-auto flex h-full w-full max-w-lg flex-col justify-center px-5 py-10">
        <p className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-fuchsia-300">
          Control de Puerta
        </p>
        <h1 className="mt-3 text-center text-3xl font-black tracking-tight">
          Setup de turno
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-center text-sm leading-6 text-white/55">
          Elegí evento, gatera y modo. Al iniciar se baja la lista local y se
          abre la cámara.
        </p>

        <div
          className="mt-8 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/5 p-1"
          role="group"
          aria-label="Modo de acceso"
        >
          <button
            type="button"
            onClick={() => onModeChange("guard")}
            className={cn(
              "inline-flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-bold transition",
              accessMode === "guard"
                ? "bg-fuchsia-600 text-white"
                : "text-white/55 hover:text-white",
            )}
          >
            <Smartphone className="size-5" aria-hidden="true" />
            Modo Guardia
            <span className="text-[10px] font-medium opacity-80">Manual</span>
          </button>
          <button
            type="button"
            onClick={() => onModeChange("totem")}
            className={cn(
              "inline-flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-bold transition",
              accessMode === "totem"
                ? "bg-emerald-600 text-white"
                : "text-white/55 hover:text-white",
            )}
          >
            <Monitor className="size-5" aria-hidden="true" />
            Modo Tótem
            <span className="text-[10px] font-medium opacity-80">
              Autoservicio
            </span>
          </button>
        </div>

        <div className="mt-6 space-y-3">
          <Select
            value={eventId}
            onValueChange={(value) => onEventChange(value ?? "")}
            items={events.map((event) => ({
              value: event.id,
              label: event.title,
            }))}
          >
            <SelectTrigger className="h-14 w-full border-white/15 bg-white/10 text-left text-base text-white">
              <SelectValue placeholder="Evento">
                {selectedEvent?.title ?? null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {events.map((event) => (
                <SelectItem key={event.id} value={event.id}>
                  {event.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={gateId}
            onValueChange={(value) => onGateChange(value ?? "")}
            items={gates.map((gate) => ({
              value: gate.id,
              label: gate.label,
            }))}
          >
            <SelectTrigger className="h-14 w-full border-white/15 bg-white/10 text-left text-base text-white">
              <SelectValue placeholder="Gatera / sector">
                {selectedGate?.label ?? null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {gates.map((gate) => (
                <SelectItem key={gate.id} value={gate.id}>
                  {gate.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loadError ? (
          <p className="mt-4 text-center text-sm text-rose-300">{loadError}</p>
        ) : null}

        <Button
          type="button"
          disabled={!canStart}
          onClick={onStart}
          className="mt-8 min-h-16 w-full rounded-2xl bg-emerald-500 text-lg font-black tracking-wide text-black hover:bg-emerald-400 disabled:opacity-40"
        >
          {isStarting ? (
            <>
              <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
              Preparando lista local…
            </>
          ) : (
            "INICIAR CONTROL DE ACCESO"
          )}
        </Button>
      </div>
    </div>
  )
}
