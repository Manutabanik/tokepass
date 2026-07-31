"use client"

import { IdCard, Mail, UserRound } from "lucide-react"

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
          Datos del asistente
        </p>
        <p className="mt-1 text-xs leading-5 text-zinc-500">
          Requeridos para el pago y para buscar la entrada por DNI en puerta.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor="buyer-name"
          className="inline-flex items-center gap-1.5 text-zinc-300"
        >
          <UserRound className="size-3.5" aria-hidden="true" />
          Nombre y apellido
        </Label>
        <Input
          id="buyer-name"
          name="buyerName"
          autoComplete="name"
          disabled={disabled}
          value={value.buyerName}
          onChange={(event) =>
            onChange({ ...value, buyerName: event.target.value })
          }
          placeholder="Ej. Ana Pérez"
          className="h-11 rounded-xl border-zinc-700 bg-zinc-900 text-white placeholder:text-zinc-600"
        />
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor="buyer-dni"
          className="inline-flex items-center gap-1.5 text-zinc-300"
        >
          <IdCard className="size-3.5" aria-hidden="true" />
          DNI del asistente
        </Label>
        <Input
          id="buyer-dni"
          name="buyerDni"
          inputMode="numeric"
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
          className="h-11 rounded-xl border-zinc-700 bg-zinc-900 text-white placeholder:text-zinc-600"
        />
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor="buyer-email"
          className="inline-flex items-center gap-1.5 text-zinc-300"
        >
          <Mail className="size-3.5" aria-hidden="true" />
          Confirmación de correo
        </Label>
        <Input
          id="buyer-email"
          name="buyerEmail"
          type="email"
          autoComplete="email"
          disabled={disabled}
          value={value.buyerEmail}
          onChange={(event) =>
            onChange({ ...value, buyerEmail: event.target.value })
          }
          placeholder="tu@email.com"
          className="h-11 rounded-xl border-zinc-700 bg-zinc-900 text-white placeholder:text-zinc-600"
        />
      </div>
    </div>
  )
}
