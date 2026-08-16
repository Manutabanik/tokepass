"use client"

import { useEffect, useState } from "react"

import { BrandLogo } from "@/components/shared/brand-logo"
import { WAITING_ROOM_POLL_MS } from "@/lib/waiting-room/config"

export function WaitingRoomClient({
  eventKey,
  nextPath,
}: {
  eventKey: string
  nextPath: string
}) {
  const [lastCheck, setLastCheck] = useState<string | null>(null)

  useEffect(() => {
    if (!eventKey) return
    let cancelled = false

    async function poll() {
      try {
        const response = await fetch(
          `/api/queue-status?event=${encodeURIComponent(eventKey)}`,
          { cache: "no-store" },
        )
        const body = (await response.json()) as { status?: string }
        if (cancelled) return
        setLastCheck(new Date().toLocaleTimeString("es-AR"))
        if (body.status === "ready") {
          window.location.replace(nextPath || `/eventos/${eventKey}`)
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

  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-[#05030a] px-6 text-center text-zinc-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.28),transparent_42%),radial-gradient(circle_at_bottom,rgba(16,185,129,0.12),transparent_36%)]" />
      <div className="relative flex max-w-xl flex-col items-center gap-8">
        <div className="animate-pulse">
          <BrandLogo href={null} inverted size="lg" />
        </div>
        <div className="space-y-4">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-violet-300">
            Sala de espera virtual
          </p>
          <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl">
            Estas en la fila.
          </h1>
          <p className="text-base leading-relaxed text-zinc-300 sm:text-lg">
            Estás en la fila virtual. Por favor, no actualices esta página, tu
            turno se refrescará automáticamente.
          </p>
        </div>
        <p className="text-sm text-zinc-500">
          {lastCheck
            ? `Ultima consulta: ${lastCheck}`
            : "Consultando capacidad..."}
        </p>
      </div>
    </main>
  )
}
