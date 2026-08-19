"use client"

import { LoaderCircle, LogOut, Monitor, Smartphone } from "lucide-react"

import { endDoorGuestSession } from "@/app/actions/door-access"
import type { ScannerEventOption } from "@/app/actions/scanner"
import { Button } from "@/components/ui/button"
import type { ScannerAccessMode } from "@/lib/scanner/access-mode"
import type { ScannerGate } from "@/lib/scanner/gate"
import { cn } from "@/lib/utils"

export function DoorScannerSetup({
  guestMode = false,
  events,
  eventId,
  gates,
  gateId,
  accessMode,
  loadError,
  isStarting,
  sessionPin,
  vaultExists,
  deviceSlotCount,
  deviceSlotIndex,
  onEventChange,
  onGateChange,
  onModeChange,
  onSessionPinChange,
  onDeviceSlotCountChange,
  onDeviceSlotIndexChange,
  onStart,
}: {
  guestMode?: boolean
  events: ScannerEventOption[]
  eventId: string
  gates: ScannerGate[]
  gateId: string
  accessMode: ScannerAccessMode
  loadError: string | null
  isStarting: boolean
  sessionPin: string
  vaultExists: boolean
  deviceSlotCount: number
  deviceSlotIndex: number
  onEventChange: (id: string) => void
  onGateChange: (id: string) => void
  onModeChange: (mode: ScannerAccessMode) => void
  onSessionPinChange: (pin: string) => void
  onDeviceSlotCountChange: (count: number) => void
  onDeviceSlotIndexChange: (index: number) => void
  onStart: () => void
}) {
  const pinOk = /^\d{4,8}$/.test(sessionPin.trim())
  const canStart = Boolean(eventId && gateId) && pinOk && !isStarting

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
          Elegi evento, gatera y modo. Al iniciar se baja la lista local y se
          abre la camara.
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
            Modo Totem
            <span className="text-[10px] font-medium opacity-80">
              Autoservicio
            </span>
          </button>
        </div>

        <div className="mt-6 space-y-3">
          <label className="block text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
            Evento
          </label>
          {guestMode ? (
            <div className="flex h-14 items-center rounded-xl border border-white/15 bg-white/10 px-4 text-base text-white">
              {events.find((event) => event.id === eventId)?.title ||
                "Evento de este PIN"}
            </div>
          ) : (
            <select
              value={eventId}
              onChange={(event) => onEventChange(event.target.value)}
              className="h-14 w-full appearance-none rounded-xl border border-white/15 bg-white/10 px-4 text-base text-white"
            >
              {events.length === 0 ? (
                <option value="">Cargando eventos…</option>
              ) : null}
              {events.map((event) => (
                <option key={event.id} value={event.id} className="text-zinc-950">
                  {event.title}
                </option>
              ))}
            </select>
          )}

          <label className="block text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
            Gatera / sector
          </label>
          <select
            value={gateId}
            onChange={(event) => onGateChange(event.target.value)}
            disabled={!eventId}
            className="h-14 w-full appearance-none rounded-xl border border-white/15 bg-white/10 px-4 text-base text-white disabled:opacity-40"
          >
            {gates.length === 0 ? (
              <option value="">Cargando gateras…</option>
            ) : null}
            {gates.map((gate) => (
              <option key={gate.id} value={gate.id} className="text-zinc-950">
                {gate.label}
              </option>
            ))}
          </select>

          <label className="block text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
            PIN de validador
          </label>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            value={sessionPin}
            onChange={(event) =>
              onSessionPinChange(event.target.value.replace(/\D/g, "").slice(0, 8))
            }
            placeholder={vaultExists ? "PIN de este dispositivo" : "Crear PIN de 4 a 8 digitos"}
            className="h-14 w-full rounded-xl border border-white/15 bg-white/10 px-4 text-base tracking-[0.24em] text-white placeholder:tracking-normal placeholder:text-white/35"
          />
          <p className="text-[11px] leading-5 text-white/40">
            Cifra las semillas LivingQR en este aparato. No se guarda el PIN.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
                Pistolas en gatera
              </label>
              <select
                value={String(deviceSlotCount)}
                onChange={(event) =>
                  onDeviceSlotCountChange(Number(event.target.value))
                }
                className="mt-1 h-14 w-full appearance-none rounded-xl border border-white/15 bg-white/10 px-4 text-base text-white"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((count) => (
                  <option key={count} value={count} className="text-zinc-950">
                    {count}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
                Esta pistola
              </label>
              <select
                value={String(deviceSlotIndex)}
                onChange={(event) =>
                  onDeviceSlotIndexChange(Number(event.target.value))
                }
                disabled={deviceSlotCount <= 1}
                className="mt-1 h-14 w-full appearance-none rounded-xl border border-white/15 bg-white/10 px-4 text-base text-white disabled:opacity-40"
              >
                {Array.from({ length: deviceSlotCount }, (_, index) => (
                  <option key={index} value={index} className="text-zinc-950">
                    {index + 1} de {deviceSlotCount}
                  </option>
                ))}
              </select>
            </div>
          </div>
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
        {guestMode ? (
          <button
            type="button"
            onClick={() => void endDoorGuestSession()}
            className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 text-sm font-semibold text-white/55 transition hover:text-white"
          >
            <LogOut className="size-4" aria-hidden="true" />
            Salir del PIN de puerta
          </button>
        ) : null}
      </div>
    </div>
  )
}
