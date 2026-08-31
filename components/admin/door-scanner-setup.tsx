"use client"

import { LoaderCircle, LogOut, Monitor, RefreshCw, Smartphone } from "lucide-react"
import type { CSSProperties, SelectHTMLAttributes } from "react"

import { endDoorGuestSession } from "@/app/actions/door-access"
import type { ScannerEventOption } from "@/app/actions/scanner"
import { AppTakeover } from "@/components/ui/app-takeover"
import { Button } from "@/components/ui/button"
import type { ScannerAccessMode } from "@/lib/scanner/access-mode"
import type { ScannerGate } from "@/lib/scanner/gate"
import { cn } from "@/lib/utils"

const NATIVE_SELECT_STYLE: CSSProperties = {
  fontSize: 16,
  WebkitAppearance: "menulist-button",
  appearance: "menulist-button",
}

function NativeSetupSelect({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative z-20">
      <select
        {...props}
        className={cn(
          "relative z-20 h-14 w-full touch-manipulation rounded-xl border border-white/25 bg-[#16161f] px-3 text-base text-white [color-scheme:dark] disabled:opacity-40",
          className,
        )}
        style={NATIVE_SELECT_STYLE}
      >
        {children}
      </select>
    </div>
  )
}

export function DoorScannerSetup({
  guestMode = false,
  events,
  eventId,
  gates,
  gateId,
  accessMode,
  loadError,
  eventsLoading = false,
  gatesLoading = false,
  catalogStale = false,
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
  onRetry,
}: {
  guestMode?: boolean
  events: ScannerEventOption[]
  eventId: string
  gates: ScannerGate[]
  gateId: string
  accessMode: ScannerAccessMode
  loadError: string | null
  eventsLoading?: boolean
  gatesLoading?: boolean
  catalogStale?: boolean
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
  onRetry?: () => void
}) {
  const pinOk = /^\d{4,8}$/.test(sessionPin.trim())
  const canStart = Boolean(eventId && gateId) && pinOk && !isStarting
  const eventPlaceholder = eventsLoading
    ? "Cargando eventos…"
    : loadError
      ? "No se pudieron cargar los eventos"
      : "No hay eventos asignados"
  const gatePlaceholder = !eventId
    ? "Elegí un evento primero"
    : gatesLoading
      ? "Cargando gateras…"
      : "No hay gateras"

  return (
    <AppTakeover className="overflow-y-auto overflow-x-hidden bg-[#05050a] text-white">
      <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col justify-center px-5 py-10">
        <p className="text-center text-[11px] font-bold uppercase tracking-[0.22em] text-fuchsia-300">
          Control de Puerta
        </p>
        <h1 className="mt-3 text-center text-3xl font-black tracking-tight">
          Setup de turno
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-center text-sm leading-6 text-white/55">
          Elegí evento, gatera y modo. La cámara se abre recién cuando iniciás
          el control.
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
          <label
            htmlFor="scanner-setup-event"
            className="block text-[11px] font-bold uppercase tracking-[0.16em] text-white/45"
          >
            Evento
          </label>
          {guestMode ? (
            <div className="flex h-14 items-center rounded-xl border border-white/15 bg-white/10 px-4 text-base text-white">
              {events.find((event) => event.id === eventId)?.title ||
                "Evento de este PIN"}
            </div>
          ) : (
            <NativeSetupSelect
              id="scanner-setup-event"
              value={eventId}
              disabled={eventsLoading && events.length === 0}
              onChange={(event) => onEventChange(event.target.value)}
              aria-busy={eventsLoading}
            >
              {events.length === 0 ? (
                <option value="">{eventPlaceholder}</option>
              ) : null}
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title}
                </option>
              ))}
            </NativeSetupSelect>
          )}

          <label
            htmlFor="scanner-setup-gate"
            className="block text-[11px] font-bold uppercase tracking-[0.16em] text-white/45"
          >
            Gatera / sector
          </label>
          <NativeSetupSelect
            id="scanner-setup-gate"
            value={gateId}
            disabled={!eventId && gates.length === 0}
            onChange={(event) => onGateChange(event.target.value)}
            aria-busy={gatesLoading}
          >
            {gates.length === 0 ? (
              <option value="">{gatePlaceholder}</option>
            ) : null}
            {gates.map((gate) => (
              <option key={gate.id} value={gate.id}>
                {gate.label}
              </option>
            ))}
          </NativeSetupSelect>

          <label
            htmlFor="scanner-setup-pin"
            className="block text-[11px] font-bold uppercase tracking-[0.16em] text-white/45"
          >
            PIN de validador
          </label>
          <input
            id="scanner-setup-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            value={sessionPin}
            onChange={(event) =>
              onSessionPinChange(event.target.value.replace(/\D/g, "").slice(0, 8))
            }
            placeholder={vaultExists ? "PIN de este dispositivo" : "Crear PIN de 4 a 8 digitos"}
            className="h-14 w-full touch-manipulation rounded-xl border border-white/15 bg-[#16161f] px-4 text-base tracking-[0.24em] text-white placeholder:tracking-normal placeholder:text-white/35"
            style={{ fontSize: 16 }}
          />
          <p className="text-[11px] leading-5 text-white/40">
            Cifra las semillas LivingQR en este aparato. No se guarda el PIN.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="scanner-setup-slot-count"
                className="block text-[11px] font-bold uppercase tracking-[0.16em] text-white/45"
              >
                Pistolas en gatera
              </label>
              <NativeSetupSelect
                id="scanner-setup-slot-count"
                value={String(deviceSlotCount)}
                onChange={(event) =>
                  onDeviceSlotCountChange(Number(event.target.value))
                }
                className="mt-1"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </NativeSetupSelect>
            </div>
            <div>
              <label
                htmlFor="scanner-setup-slot-index"
                className="block text-[11px] font-bold uppercase tracking-[0.16em] text-white/45"
              >
                Esta pistola
              </label>
              <NativeSetupSelect
                id="scanner-setup-slot-index"
                value={String(deviceSlotIndex)}
                onChange={(event) =>
                  onDeviceSlotIndexChange(Number(event.target.value))
                }
                disabled={deviceSlotCount <= 1}
                className="mt-1"
              >
                {Array.from({ length: deviceSlotCount }, (_, index) => (
                  <option key={index} value={index}>
                    {index + 1} de {deviceSlotCount}
                  </option>
                ))}
              </NativeSetupSelect>
            </div>
          </div>
        </div>

        {loadError || catalogStale ? (
          <div
            role="alert"
            className="mt-4 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-center"
          >
            {loadError ? (
              <p className="text-sm font-semibold text-amber-100">{loadError}</p>
            ) : (
              <p className="text-sm text-amber-100/90">
                Mostrando la lista guardada en este aparato. Reintentá cuando
                haya señal.
              </p>
            )}
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-black text-black"
              >
                <RefreshCw className="size-4" aria-hidden="true" />
                Reintentar conexión
              </button>
            ) : null}
          </div>
        ) : null}

        <Button
          type="button"
          disabled={!canStart}
          onClick={onStart}
          className="mt-8 min-h-16 w-full touch-manipulation rounded-2xl bg-emerald-500 text-lg font-black tracking-wide text-black hover:bg-emerald-400 disabled:opacity-40"
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
    </AppTakeover>
  )
}
