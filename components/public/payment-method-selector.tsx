"use client"

import {
  BadgePercent,
  CreditCard,
  Lock,
  Wallet,
} from "lucide-react"

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { cn } from "@/lib/utils"

export type CheckoutPaymentProvider =
  | "mercadopago"
  | "payway"
  | "naranjax"
  | "modo"

export interface PaymentMethodSelectorProps {
  selectedProvider: CheckoutPaymentProvider
  onSelectProvider: (provider: CheckoutPaymentProvider) => void
  disabled?: boolean
}

const OPTIONS: Array<{
  value: Exclude<CheckoutPaymentProvider, "modo">
  title: string
  subtitle: string
  icon: typeof CreditCard
  iconClassName: string
}> = [
  {
    value: "payway",
    title: "Tarjetas de Crédito / Débito",
    subtitle: "Cuota Simple 3 y 6 cuotas (Visa, Mastercard, Cabal)",
    icon: CreditCard,
    iconClassName: "w-5 h-5 text-primary",
  },
  {
    value: "naranjax",
    title: "Tarjeta Naranja X",
    subtitle: "Plan Z y cuotas fijas",
    icon: BadgePercent,
    iconClassName: "w-5 h-5 text-amber-600 dark:text-amber-400",
  },
  {
    value: "mercadopago",
    title: "Mercado Pago",
    subtitle: "Dinero en cuenta o tarjetas guardadas",
    icon: Wallet,
    iconClassName: "w-5 h-5 text-sky-500",
  },
]

function isCheckoutPaymentProvider(
  value: string,
): value is CheckoutPaymentProvider {
  return (
    value === "mercadopago" ||
    value === "payway" ||
    value === "naranjax" ||
    value === "modo"
  )
}

export function PaymentMethodSelector({
  selectedProvider,
  onSelectProvider,
  disabled = false,
}: PaymentMethodSelectorProps) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        Medio de pago
      </p>
      <RadioGroup
        value={selectedProvider}
        disabled={disabled}
        onValueChange={(value) => {
          if (isCheckoutPaymentProvider(value)) onSelectProvider(value)
        }}
        className="grid gap-3"
        aria-label="Método de pago"
      >
        {OPTIONS.map((option) => {
          const selected = selectedProvider === option.value
          const Icon = option.icon
          return (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-4 transition-all dark:border-border dark:bg-card",
                "hover:border-primary/40",
                selected &&
                  "border-primary bg-primary/5 ring-2 ring-primary/20 dark:bg-primary/10",
                disabled && "cursor-not-allowed opacity-60 hover:border-border",
              )}
            >
              <RadioGroupItem
                value={option.value}
                disabled={disabled}
                className="mt-1"
                aria-label={option.title}
              />
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted dark:bg-muted">
                <Icon className={option.iconClassName} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">
                  {option.title}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                  {option.subtitle}
                </span>
              </span>
            </label>
          )
        })}
      </RadioGroup>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        Procesamiento seguro encriptado de 256 bits.
      </p>
    </div>
  )
}
