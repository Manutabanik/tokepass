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
    <nav aria-label="Progreso de compra" className="flex items-center gap-2">
      {STEPS.map((item, index) => {
        const Icon = item.icon
        const active = index === activeIndex
        const done = index < activeIndex
        return (
          <div key={item.id} className="flex min-w-0 flex-1 items-center gap-2">
            <div
              className={cn(
                "flex min-w-0 items-center gap-2",
                active && "text-primary",
                done && "text-foreground",
                !active && !done && "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full border-2",
                  active &&
                    "border-primary bg-primary text-primary-foreground ring-2 ring-primary/35",
                  done && "border-primary bg-primary/15 text-primary",
                  !active &&
                    !done &&
                    "border-border bg-muted text-muted-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span
                className={cn(
                  "truncate leading-tight",
                  active ? "text-base font-extrabold" : "text-sm font-semibold",
                )}
              >
                {item.label}
              </span>
            </div>
            {index < STEPS.length - 1 ? (
              <div
                className={cn(
                  "h-1 min-w-3 flex-1 rounded-full",
                  done ? "bg-primary" : "bg-border",
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
