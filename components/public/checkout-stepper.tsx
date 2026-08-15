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

const STEP_HINT: Record<CheckoutFlowStep, string> = {
  tickets: "Elegí entradas o lugares. Después van tus datos y el pago.",
  upsell: "Podés sumar extras ahora o seguir sin ellos.",
  details: "Confirmá tus datos. El pago es el último paso.",
  payment: "Revisá el total y confirmá. El QR queda listo al instante.",
}

export function CheckoutStepper({
  step,
}: {
  step: CheckoutFlowStep
}) {
  const visualStep = step === "upsell" ? "tickets" : step
  const activeIndex = Math.max(0, STEPS.findIndex((item) => item.id === visualStep))
  const current = STEPS[activeIndex] ?? STEPS[0]!
  const trackProgress = (activeIndex / (STEPS.length - 1)) * 66.666

  return (
    <nav aria-label="Progreso de compra">
      <p className="sr-only">
        Paso {activeIndex + 1} de {STEPS.length}: {current.label}
      </p>

      <div className="space-y-3 md:hidden">
        <div className="relative">
          <div
            className="absolute top-5 right-[16.666%] left-[16.666%] h-1 rounded-full bg-border"
            aria-hidden="true"
          />
          <div
            className="absolute top-5 left-[16.666%] h-1 rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${trackProgress}%` }}
            aria-hidden="true"
          />
          <ol className="relative grid grid-cols-3">
            {STEPS.map((item, index) => {
              const Icon = item.icon
              const active = index === activeIndex
              const done = index < activeIndex
              return (
                <li key={item.id} className="flex min-w-0 flex-col items-center gap-1.5">
                  <span
                    className={cn(
                      "grid size-10 shrink-0 place-items-center rounded-full border-2 bg-card",
                      active &&
                        "border-primary bg-primary text-primary-foreground shadow-md ring-4 ring-primary/20",
                      done && "border-primary bg-primary/15 text-primary",
                      !active &&
                        !done &&
                        "border-border bg-muted text-muted-foreground",
                    )}
                    aria-current={active ? "step" : undefined}
                  >
                    {done ? (
                      <Check className="size-4" strokeWidth={2.5} aria-hidden="true" />
                    ) : (
                      <Icon className="size-4" aria-hidden="true" />
                    )}
                  </span>
                  <span
                    className={cn(
                      "w-full text-center text-xs leading-tight",
                      active && "font-extrabold text-primary",
                      done && "font-semibold text-foreground",
                      !active && !done && "font-medium text-muted-foreground",
                    )}
                  >
                    {item.shortLabel}
                  </span>
                </li>
              )
            })}
          </ol>
        </div>
        <p className="text-sm leading-5 text-muted-foreground">{STEP_HINT[step]}</p>
      </div>

      <div className="hidden flex-wrap items-center gap-2 md:flex">
        {STEPS.map((item, index) => {
          const Icon = item.icon
          const active = index === activeIndex
          const done = index < activeIndex
          return (
            <div key={item.id} className="flex items-center gap-2">
              <div
                className={cn(
                  "flex items-center gap-2",
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
                  {done ? (
                    <Check className="size-4" strokeWidth={2.5} aria-hidden="true" />
                  ) : (
                    <Icon className="size-4" aria-hidden="true" />
                  )}
                </span>
                <span
                  className={cn(
                    "whitespace-nowrap text-sm leading-tight",
                    active ? "font-extrabold" : "font-semibold",
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
      </div>
    </nav>
  )
}
