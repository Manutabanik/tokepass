"use client"

import { Check, CreditCard, Ticket, User } from "lucide-react"

import { cn } from "@/lib/utils"

export type CheckoutFlowStep = "tickets" | "upsell" | "details" | "payment"

const STEPS: Array<{
  id: Exclude<CheckoutFlowStep, "upsell">
  label: string
  shortLabel: string
  icon: typeof Ticket
}> = [
  { id: "tickets", label: "Entradas", shortLabel: "Entradas", icon: Ticket },
  { id: "details", label: "Tus datos", shortLabel: "Datos", icon: User },
  { id: "payment", label: "Pago", shortLabel: "Pago", icon: CreditCard },
]

export function checkoutStepMeta(step: CheckoutFlowStep) {
  const visualStep = step === "upsell" ? "tickets" : step
  const activeIndex = Math.max(0, STEPS.findIndex((item) => item.id === visualStep))
  const current = STEPS[activeIndex] ?? STEPS[0]!
  return {
    activeIndex,
    stepNumber: activeIndex + 1,
    total: STEPS.length,
    label: current.shortLabel,
    fullLabel: current.label,
  }
}

export function CheckoutStepper({
  step,
  compact = false,
}: {
  step: CheckoutFlowStep
  compact?: boolean
}) {
  const visualStep = step === "upsell" ? "tickets" : step
  const activeIndex = Math.max(0, STEPS.findIndex((item) => item.id === visualStep))
  const current = STEPS[activeIndex] ?? STEPS[0]!

  return (
    <nav aria-label="Progreso de compra">
      <p className="sr-only">
        Paso {activeIndex + 1} de {STEPS.length}: {current.label}
      </p>
      <ol
        className={cn(
          "flex items-center gap-1",
          compact &&
            "rounded-full border border-border/40 bg-secondary/30 p-1.5",
        )}
      >
        {STEPS.map((item, index) => {
          const Icon = item.icon
          const active = index === activeIndex
          const done = index < activeIndex
          return (
            <li key={item.id} className="flex items-center gap-1">
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-2 py-1",
                  active && "bg-primary text-primary-foreground shadow-sm",
                  done && "text-foreground",
                  !active && !done && "text-muted-foreground",
                )}
                aria-current={active ? "step" : undefined}
              >
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full md:size-8",
                    active && "bg-primary-foreground/15 text-primary-foreground",
                    done && "bg-primary/15 text-primary",
                    !active &&
                      !done &&
                      "border border-border/70 bg-muted/60 text-muted-foreground",
                  )}
                >
                  {done ? (
                    <Check className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
                  ) : (
                    <Icon className="size-3.5" aria-hidden="true" />
                  )}
                </span>
                <span
                  className={cn(
                    "hidden text-xs font-bold whitespace-nowrap sm:inline",
                    active && "text-primary-foreground",
                  )}
                >
                  {index + 1}. {item.shortLabel}
                </span>
              </div>
              {index < STEPS.length - 1 ? (
                <span
                  className={cn(
                    "hidden h-px w-4 rounded-full sm:block",
                    done ? "bg-primary" : "bg-border/70",
                  )}
                  aria-hidden="true"
                />
              ) : null}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
