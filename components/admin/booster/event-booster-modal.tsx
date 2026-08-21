"use client"

import { Check, Crown, LoaderCircle, Rocket, Zap } from "lucide-react"
import { motion } from "motion/react"
import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { BOOST_PLANS, type BoostTier } from "@/lib/boost-plans"
import { formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"

const TIER_ICON = {
  flash_3d: Zap,
  pro_7d: Rocket,
  vip_total: Crown,
} as const

type EventBoosterModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  eventId: string
  eventTitle: string
}

function PlanGrid({
  selected,
  onSelect,
}: {
  selected: BoostTier
  onSelect: (tier: BoostTier) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {BOOST_PLANS.map((plan) => {
        const isSelected = selected === plan.tier
        const Icon = TIER_ICON[plan.tier as BoostTier]
        return (
          <motion.button
            key={plan.tier}
            type="button"
            onClick={() => onSelect(plan.tier as BoostTier)}
            whileTap={{ scale: 0.98 }}
            className={cn(
              "relative rounded-2xl border p-4 text-left transition",
              isSelected
                ? "border-cyan-400/50 bg-cyan-400/10 shadow-[0_0_24px_rgba(34,211,238,0.2)]"
                : "border-border bg-card/70 hover:border-cyan-500/30",
            )}
          >
            {plan.popular ? (
              <span className="absolute -top-2 right-3 rounded-full bg-violet-500 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase">
                Más popular
              </span>
            ) : null}
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-foreground">
                <Icon className="size-4 text-cyan-300" aria-hidden="true" />
                {plan.name}
              </span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-cyan-200 uppercase">
                {plan.multiplierLabel}
              </span>
            </div>
            <p className="mt-3 text-2xl font-black text-foreground">
              {formatCurrency(plan.priceArs)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {plan.durationDays} días de impulso
            </p>
            <ul className="mt-3 space-y-1.5">
              {plan.benefits.map((benefit) => (
                <li
                  key={benefit}
                  className="flex items-start gap-1.5 text-[11px] leading-4 text-muted-foreground"
                >
                  <Check
                    className="mt-0.5 size-3 shrink-0 text-emerald-600 dark:text-emerald-400"
                    aria-hidden="true"
                  />
                  {benefit}
                </li>
              ))}
            </ul>
          </motion.button>
        )
      })}
    </div>
  )
}

function PayButton({
  pending,
  onPay,
}: {
  pending: boolean
  onPay: () => void
}) {
  return (
    <Button
      type="button"
      disabled={pending}
      onClick={onPay}
      className="h-12 w-full rounded-full bg-cyan-400 text-zinc-950 hover:bg-cyan-300"
    >
      {pending ? (
        <LoaderCircle className="animate-spin" />
      ) : (
        <Zap className="size-4" aria-hidden="true" />
      )}
      Pagar y activar impulso
    </Button>
  )
}

export function EventBoosterModal({
  open,
  onOpenChange,
  eventId,
  eventTitle,
}: EventBoosterModalProps) {
  const [tier, setTier] = useState<BoostTier>("pro_7d")
  const [isMobile, setIsMobile] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)")
    const sync = () => setIsMobile(media.matches)
    sync()
    media.addEventListener("change", sync)
    return () => media.removeEventListener("change", sync)
  }, [])

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

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Motor de impulso</SheetTitle>
            <SheetDescription>
              Elegí un plan para destacar{" "}
              <span className="font-medium text-foreground">{eventTitle}</span>.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <PlanGrid selected={tier} onSelect={setTier} />
          </div>
          <SheetFooter>
            <PayButton pending={isPending} onPay={handlePay} />
          </SheetFooter>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-background text-foreground sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-black tracking-tight">
            Motor de impulso
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Multiplicá las ventas de{" "}
            <span className="font-medium text-foreground">{eventTitle}</span>{" "}
            con pauta automática en TokePass.
          </DialogDescription>
        </DialogHeader>
        <PlanGrid selected={tier} onSelect={setTier} />
        <PayButton pending={isPending} onPay={handlePay} />
      </DialogContent>
    </Dialog>
  )
}
