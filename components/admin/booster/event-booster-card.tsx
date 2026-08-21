"use client"

import { Eye, Rocket, Timer, Zap } from "lucide-react"
import { motion } from "motion/react"
import { useEffect, useState } from "react"

import { EventBoosterModal } from "@/components/admin/booster/event-booster-modal"
import { Button } from "@/components/ui/button"
import {
  formatBoostRemaining,
  getBoostPlan,
  isFeaturedBoostActive,
} from "@/lib/boost-plans"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

export function EventBoosterCard({
  eventId,
  eventTitle,
  isFeatured,
  featuredUntil,
  featuredTier,
  storefrontViews = 0,
  boostHint = null,
}: {
  eventId: string
  eventTitle: string
  isFeatured?: boolean | null
  featuredUntil?: string | null
  featuredTier?: string | null
  storefrontViews?: number | null
  boostHint?: "success" | "pending" | "failure" | null
}) {
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const active = isFeaturedBoostActive({
    isFeatured,
    featuredUntil,
    now,
  })

  useEffect(() => {
    if (!active || !featuredUntil) return
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [active, featuredUntil])

  const plan = featuredTier ? getBoostPlan(featuredTier) : null
  const remaining = featuredUntil
    ? formatBoostRemaining(featuredUntil, now)
    : "Finalizado"

  const hint =
    boostHint === "success"
      ? "Pago recibido. El impulso se activa cuando Mercado Pago confirma el webhook."
      : boostHint === "pending"
        ? "Pago pendiente. Te avisamos cuando Mercado Pago lo confirme."
        : boostHint === "failure"
          ? "No se completó el pago. Podés reintentarlo ahora."
          : null

  return (
    <>
      <motion.aside
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        className={cn(
          "overflow-hidden rounded-2xl border p-5 sm:p-6",
          active
            ? "border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-background to-background"
            : "border-cyan-500/25 bg-gradient-to-br from-cyan-500/10 via-violet-500/5 to-background",
        )}
      >
        {hint ? (
          <p
            className={cn(
              "mb-4 rounded-xl border px-3 py-2 text-sm",
              boostHint === "failure"
                ? "border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-200"
                : boostHint === "pending"
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
            )}
          >
            {hint}
          </p>
        ) : null}

        {active ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-2">
              <p className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-emerald-600 uppercase dark:text-emerald-300">
                <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
                Impulso activo
                {plan ? ` · ${plan.name}` : null}
              </p>
              <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                Tu evento está en posición destacada
              </h2>
              <div className="flex flex-wrap gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-3 py-1 text-sm text-foreground">
                  <Timer className="size-3.5 text-emerald-500" aria-hidden="true" />
                  {remaining} restantes
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-3 py-1 text-sm text-foreground">
                  <Eye className="size-3.5 text-cyan-500" aria-hidden="true" />
                  {formatNumber(storefrontViews ?? 0)} visualizaciones
                </span>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(true)}
              className="h-11 shrink-0"
            >
              <Rocket className="size-4" aria-hidden="true" />
              Extender impulso
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1.5">
              <p className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-cyan-300 uppercase">
                <Rocket className="size-3.5" aria-hidden="true" />
                Nuevo · Motor de impulso
              </p>
              <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                Aumentá tus ventas hasta un +300%
              </h2>
              <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                Flash, PRO o VIP. Pagás con Mercado Pago y el destaque se
                activa solo cuando el pago está aprobado.
              </p>
            </div>
            <Button
              type="button"
              onClick={() => setOpen(true)}
              className="h-11 shrink-0 bg-cyan-400 text-zinc-950 hover:bg-cyan-300"
            >
              <Zap className="size-4" aria-hidden="true" />
              Impulsar evento ahora
            </Button>
          </div>
        )}
      </motion.aside>

      <EventBoosterModal
        open={open}
        onOpenChange={setOpen}
        eventId={eventId}
        eventTitle={eventTitle}
      />
    </>
  )
}
