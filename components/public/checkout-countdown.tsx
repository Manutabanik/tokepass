"use client"

import { Timer } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import {
  formatHoldCountdown,
  GA_CHECKOUT_HOLD_MINUTES,
} from "@/lib/checkout-hold"
import { cn } from "@/lib/utils"

type CheckoutCountdownProps = {
  /** ISO 8601 del fin del hold (backend / reserved_until / now+8m). */
  expiresAt: string
  /** Redirección al vencer (ej. `/events/[id]`). */
  redirectTo?: string
  onExpired?: () => void
  className?: string
}

/**
 * Reloj UX de urgencia (MM:SS). La validez real del hold la impone
 * Postgres + Mercado Pago; este componente solo comunica y limpia UI local.
 */
export function CheckoutCountdown({
  expiresAt,
  redirectTo,
  onExpired,
  className,
}: CheckoutCountdownProps) {
  const router = useRouter()
  const expiredRef = useRef(false)
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    Math.max(
      0,
      Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000),
    ),
  )

  useEffect(() => {
    expiredRef.current = false

    function tick() {
      const seconds = Math.max(
        0,
        Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000),
      )
      setRemainingSeconds(seconds)

      if (seconds > 0 || expiredRef.current) return

      expiredRef.current = true
      toast.error("El tiempo de reserva expiró", {
        description:
          "Tu cupo se liberó. Volvé a elegir entradas si querés comprar.",
      })
      onExpired?.()
      if (redirectTo) {
        router.push(redirectTo)
        router.refresh()
      } else {
        router.refresh()
      }
    }

    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [expiresAt, onExpired, redirectTo, router])

  const urgent = remainingSeconds <= 60
  const label = formatHoldCountdown(remainingSeconds)

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        "flex items-center gap-3 rounded-2xl border px-4 py-3",
        urgent
          ? "border-red-500/35 bg-red-500/15 text-red-100"
          : "border-amber-500/30 bg-amber-500/10 text-amber-100",
        className,
      )}
    >
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-full",
          urgent ? "bg-red-500/20 text-red-300" : "bg-amber-500/20 text-amber-300",
        )}
      >
        <Timer className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug">
          Tu entrada está reservada. Tenés{" "}
          <span className="font-mono text-base font-black tabular-nums">
            {label}
          </span>{" "}
          minutos para completar el pago
        </p>
        <p className="mt-0.5 text-xs opacity-80">
          Ventana de {GA_CHECKOUT_HOLD_MINUTES} minutos. Si vence, el stock
          vuelve a estar disponible.
        </p>
      </div>
    </div>
  )
}
