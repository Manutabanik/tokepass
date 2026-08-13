"use client"

import { IdCard, Mail, Phone, UserRound } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { CheckoutBuyerInfo } from "@/lib/checkout-buyer"
import { cn } from "@/lib/utils"

type CheckoutBuyerFieldsProps = {
  value: CheckoutBuyerInfo
  onChange: (next: CheckoutBuyerInfo) => void
  disabled?: boolean
  className?: string
}

const fieldInputClass =
  "min-h-12 h-12 rounded-xl border-zinc-700 bg-zinc-900 text-base text-white placeholder:text-zinc-600 md:text-base"

export function CheckoutBuyerFields({
  value,
  onChange,
  disabled = false,
  className,
}: CheckoutBuyerFieldsProps) {
  return (
    <div
      className={cn(
        "space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4",
        className,
      )}
    >
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500">
          Tus datos
        </p>
        <p className="mt-1 text-sm leading-5 text-zinc-500">
          Los usamos para tu entrada y para encontrarte en la puerta.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor="buyer-name"
          className="inline-flex min-h-11 items-center gap-1.5 text-zinc-300"
        >
          <UserRound className="size-3.5" aria-hidden="true" />
          Nombre y apellido
        </Label>
        <Input
          id="buyer-name"
          name="buyerName"
          autoComplete="name"
          autoCapitalize="words"
          disabled={disabled}
          value={value.buyerName}
          onChange={(event) =>
            onChange({ ...value, buyerName: event.target.value })
          }
          placeholder="Ej. Ana Pérez"
          className={fieldInputClass}
        />
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor="buyer-dni"
          className="inline-flex min-h-11 items-center gap-1.5 text-zinc-300"
        >
          <IdCard className="size-3.5" aria-hidden="true" />
          DNI
        </Label>
        <Input
          id="buyer-dni"
          name="buyerDni"
          type="tel"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          disabled={disabled}
          value={value.buyerDni}
          onChange={(event) =>
            onChange({
              ...value,
              buyerDni: event.target.value.replace(/\D/g, "").slice(0, 10),
            })
          }
          placeholder="Solo números"
          className={fieldInputClass}
        />
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor="buyer-phone"
          className="inline-flex min-h-11 items-center gap-1.5 text-zinc-300"
        >
          <Phone className="size-3.5" aria-hidden="true" />
          Teléfono / WhatsApp
        </Label>
        <Input
          id="buyer-phone"
          name="buyerPhone"
          type="tel"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="tel"
          disabled={disabled}
          value={value.buyerPhone}
          onChange={(event) =>
            onChange({
              ...value,
              buyerPhone: event.target.value.replace(/\D/g, "").slice(0, 15),
            })
          }
          placeholder="Ej. 1123456789"
          className={fieldInputClass}
        />
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor="buyer-email"
          className="inline-flex min-h-11 items-center gap-1.5 text-zinc-300"
        >
          <Mail className="size-3.5" aria-hidden="true" />
          Tu Email
        </Label>
        <Input
          id="buyer-email"
          name="buyerEmail"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="email"
          disabled={disabled}
          value={value.buyerEmail}
          onChange={(event) =>
            onChange({ ...value, buyerEmail: event.target.value })
          }
          placeholder="tunombre@email.com"
          className={fieldInputClass}
        />
      </div>
    </div>
  )
}
