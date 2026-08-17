"use client"

import { useEffect, useState } from "react"

import { BrandLogo } from "@/components/shared/brand-logo"
import { WAITING_ROOM_POLL_MS } from "@/lib/waiting-room/config"

type QueueStatusResponse = {
  status?: "waiting" | "ready"
  position?: number
  etaSeconds?: number
}

export function WaitingRoomClient({
  eventKey,
  nextPath,
}: {
  eventKey: string
  nextPath: string
}) {
  const [position, setPosition] = useState<number | null>(null)
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null)
  const [lastCheck, setLastCheck] = useState<string | null>(null)

  useEffect(() => {
    if (!eventKey) return
    let cancelled = false

    async function poll() {
      try {
        const response = await fetch(
          `/api/queue/status?event=${encodeURIComponent(eventKey)}`,
          { cache: "no-store" },
        )
        const body = (await response.json()) as QueueStatusResponse
        if (cancelled) return
        setLastCheck(new Date().toLocaleTimeString("es-AR"))
        if (typeof body.position === "number") setPosition(body.position)
        if (typeof body.etaSeconds === "number") setEtaSeconds(body.etaSeconds)
        if (body.status === "ready") {
          window.location.replace(nextPath || `/event/${eventKey}/checkout`)
        }
      } catch {
        if (!cancelled) {
          setLastCheck(new Date().toLocaleTimeString("es-AR"))
        }
      }
    }

    void poll()
    const id = window.setInterval(() => {
      void poll()
    }, WAITING_ROOM_POLL_MS)

    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [eventKey, nextPath])

  const placeLabel =
    position === 0
      ? "Es tu turno"
      : position != null
        ? `Lugar ${position} en la fila`
        : "Reservando tu lugar…"

  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-background px-6 text-foreground">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(circle_at_20%_0%,rgba(16,185,129,0.16),transparent_42%),radial-gradient(circle_at_85%_8%,rgba(139,92,246,0.14),transparent_36%)]"
        aria-hidden="true"
      />
      <div className="relative w-full max-w-lg">
        <div className="rounded-[1.75rem] border border-border/80 bg-card/70 p-8 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-10">
          <div className="flex flex-col items-center text-center">
            <div className="mb-6">
              <BrandLogo href={null} size="lg" />
            </div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">
              Sala de espera virtual
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
              Estás en la fila.
            </h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
              Estás en la fila virtual. Por favor, no actualices esta página
              para no perder tu lugar. Te redirigiremos automáticamente cuando
              sea tu turno.
            </p>

            <div
              className="relative mt-8 grid size-24 place-items-center"
              aria-hidden="true"
            >
              <div className="absolute inset-0 rounded-full border-2 border-border" />
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-emerald-500 border-r-violet-500" />
              <span className="text-sm font-bold tabular-nums text-foreground">
                {position == null ? "—" : position}
              </span>
            </div>

            <p className="mt-4 text-sm font-semibold text-foreground">
              {placeLabel}
            </p>
            {etaSeconds != null && etaSeconds > 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Tiempo estimado: {formatEta(etaSeconds)}
              </p>
            ) : null}

            <div className="mt-6 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="queue-slide-bar h-full w-1/3 rounded-full bg-gradient-to-r from-emerald-500 to-violet-500" />
            </div>

            <p className="mt-6 text-xs text-muted-foreground">
              {lastCheck
                ? `Última consulta: ${lastCheck}`
                : "Consultando capacidad…"}
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Actualizamos tu lugar cada {Math.round(WAITING_ROOM_POLL_MS / 1000)}{" "}
              segundos.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.ceil(seconds / 60)
  return minutes === 1 ? "1 min" : `${minutes} min`
}
