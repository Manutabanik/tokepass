"use client"

import { CreditCard, Ticket, User } from "lucide-react"

import { cn } from "@/lib/utils"

export type CheckoutFlowStep = "tickets" | "details" | "payment"

const STEPS: Array<{
  id: CheckoutFlowStep
  label: string
  icon: typeof Ticket
}> = [
  { id: "tickets", label: "Entradas", icon: Ticket },
  { id: "details", label: "Tus Datos", icon: User },
  { id: "payment", label: "Pago", icon: CreditCard },
]

export function CheckoutStepper({
  step,
}: {
  step: CheckoutFlowStep
}) {
  const activeIndex = STEPS.findIndex((item) => item.id === step)

  return (
    <nav aria-label="Progreso de compra" className="flex items-center gap-1.5">
      {STEPS.map((item, index) => {
        const Icon = item.icon
        const active = index === activeIndex
        const done = index < activeIndex
        return (
          <div key={item.id} className="flex min-w-0 flex-1 items-center gap-1.5">
            <div
              className={cn(
                "flex min-w-0 items-center gap-1.5 text-[11px] leading-none tracking-wide",
                active && "font-bold text-primary",
                done && "font-medium text-foreground",
                !active && !done && "text-muted-foreground",
              )}
            >
              <Icon className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{item.label}</span>
            </div>
            {index < STEPS.length - 1 ? (
              <div
                className={cn(
                  "h-px min-w-3 flex-1",
                  done ? "bg-primary/50" : "bg-border",
                )}
                aria-hidden="true"
              />
            ) : null}
          </div>
        )
      })}
    </nav>
  )
}
