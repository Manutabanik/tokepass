"use client"

import { Check, Crown, LoaderCircle, Sparkles, Zap } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { BOOST_PLANS, type BoostTier } from "@/lib/boost-plans"
import { formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"

const TIER_ICON = {
  silver: Sparkles,
  gold: Zap,
  platinum: Crown,
} as const

type BoostModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  eventId: string
  eventTitle: string
}

export function BoostModal({
  open,
  onOpenChange,
  eventId,
  eventTitle,
}: BoostModalProps) {
  const [tier, setTier] = useState<BoostTier>("gold")
  const [isPending, startTransition] = useTransition()

  function handlePay() {
    startTransition(async () => {
      try {
        const response = await fetch("/api/boost/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId, tier }),
        })
        const json = (await response.json()) as {
          success: boolean
          error?: string
          data?: { initPoint: string }
        }

        if (!response.ok || !json.success || !json.data?.initPoint) {
          toast.error(json.error ?? "No se pudo iniciar el pago")
          return
        }

        window.location.href = json.data.initPoint
      } catch {
        toast.error("Error de red al contactar Mercado Pago")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-black tracking-tight">
            Tokepass Boost
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Multiplicá las ventas de{" "}
            <span className="font-medium text-zinc-200">{eventTitle}</span>{" "}
            destacando el evento en la portada B2C.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-3">
          {BOOST_PLANS.map((plan) => {
            const selected = tier === plan.tier
            const Icon = TIER_ICON[plan.tier]
            return (
              <button
                key={plan.tier}
                type="button"
                onClick={() => setTier(plan.tier)}
                className={cn(
                  "rounded-2xl border p-4 text-left transition",
                  selected
                    ? "border-cyan-400/50 bg-cyan-400/10 shadow-[0_0_24px_rgba(34,211,238,0.2)]"
                    : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-600",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-sm font-bold text-white">
                    <Icon className="size-4 text-cyan-300" aria-hidden="true" />
                    {plan.name}
                  </span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-200">
                    {plan.multiplierLabel}
                  </span>
                </div>
                <p className="mt-3 text-2xl font-black text-white">
                  {formatCurrency(plan.priceArs)}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {plan.durationDays} días de destaque
                </p>
                <ul className="mt-3 space-y-1.5">
                  {plan.benefits.map((benefit) => (
                    <li
                      key={benefit}
                      className="flex items-start gap-1.5 text-[11px] leading-4 text-zinc-400"
                    >
                      <Check
                        className="mt-0.5 size-3 shrink-0 text-emerald-400"
                        aria-hidden="true"
                      />
                      {benefit}
                    </li>
                  ))}
                </ul>
              </button>
            )
          })}
        </div>

        <Button
          type="button"
          disabled={isPending}
          onClick={handlePay}
          className="h-12 w-full rounded-full bg-cyan-400 text-zinc-950 hover:bg-cyan-300"
        >
          {isPending ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <Zap className="size-4" aria-hidden="true" />
          )}
          Pagar y Activar Destaque
        </Button>
      </DialogContent>
    </Dialog>
  )
}
