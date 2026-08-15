"use client"

import { IdCard, Mail, Phone, UserRound } from "lucide-react"
import type { FieldErrors } from "react-hook-form"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { CheckoutBuyerInfo } from "@/lib/checkout-buyer"
import { CHECKOUT_BUYER_FIELD_IDS } from "@/lib/checkout/validation-scroll"
import { cn } from "@/lib/utils"

type CheckoutBuyerFieldsProps = {
  value: CheckoutBuyerInfo
  onChange: (next: CheckoutBuyerInfo) => void
  disabled?: boolean
  className?: string
  errors?: FieldErrors<CheckoutBuyerInfo> | Partial<Record<keyof CheckoutBuyerInfo, string>>
  shakeSignal?: number
}

const fieldInputClass =
  "min-h-12 h-12 rounded-xl border-input bg-background text-base text-foreground placeholder:text-muted-foreground/70 md:text-base"

function fieldMessage(
  errors: CheckoutBuyerFieldsProps["errors"],
  name: keyof CheckoutBuyerInfo,
): string | undefined {
  if (!errors) return undefined
  const value = errors[name]
  if (!value) return undefined
  if (typeof value === "string") return value
  if ("message" in value && typeof value.message === "string") return value.message
  return undefined
}

export function CheckoutBuyerFields({
  value,
  onChange,
  disabled = false,
  className,
  errors,
  shakeSignal = 0,
}: CheckoutBuyerFieldsProps) {
  const nameError = fieldMessage(errors, "buyerName")
  const dniError = fieldMessage(errors, "buyerDni")
  const phoneError = fieldMessage(errors, "buyerPhone")
  const emailError = fieldMessage(errors, "buyerEmail")
  const shakeClass =
    shakeSignal > 0
      ? shakeSignal % 2 === 0
        ? "animate-checkout-shake-a"
        : "animate-checkout-shake-b"
      : null

  function inputClass(invalid: boolean, field: keyof CheckoutBuyerInfo) {
    const firstInvalid =
      (nameError && field === "buyerName") ||
      (!nameError && dniError && field === "buyerDni") ||
      (!nameError && !dniError && phoneError && field === "buyerPhone") ||
      (!nameError && !dniError && !phoneError && emailError && field === "buyerEmail")
    return cn(
      fieldInputClass,
      invalid &&
        "border-amber-500/60 bg-amber-500/5 text-foreground focus-visible:ring-amber-400/40",
      invalid && firstInvalid && shakeClass,
    )
  }

  return (
    <div
      className={cn(
        "space-y-3 rounded-2xl border border-border bg-card p-4",
        className,
      )}
    >
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Tus datos
        </p>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">
          Solo al pagar: los usamos para emitir tu entrada y encontrarte en
          puerta.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor={CHECKOUT_BUYER_FIELD_IDS.buyerName}
          className="inline-flex min-h-11 items-center gap-1.5 text-foreground"
        >
          <UserRound className="size-3.5" aria-hidden="true" />
          Nombre y apellido
        </Label>
        <Input
          id={CHECKOUT_BUYER_FIELD_IDS.buyerName}
          name="buyerName"
          autoComplete="name"
          autoCapitalize="words"
          disabled={disabled}
          value={value.buyerName}
          aria-invalid={Boolean(nameError)}
          aria-describedby={nameError ? "buyer-name-error" : undefined}
          onChange={(event) =>
            onChange({ ...value, buyerName: event.target.value })
          }
          placeholder="Ej. Ana Pérez"
          className={inputClass(Boolean(nameError), "buyerName")}
        />
        <FieldHint id="buyer-name-error" message={nameError} />
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor={CHECKOUT_BUYER_FIELD_IDS.buyerDni}
          className="inline-flex min-h-11 items-center gap-1.5 text-foreground"
        >
          <IdCard className="size-3.5" aria-hidden="true" />
          DNI
        </Label>
        <Input
          id={CHECKOUT_BUYER_FIELD_IDS.buyerDni}
          name="buyerDni"
          type="tel"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          disabled={disabled}
          value={value.buyerDni}
          aria-invalid={Boolean(dniError)}
          aria-describedby={dniError ? "buyer-dni-error" : undefined}
          onChange={(event) =>
            onChange({
              ...value,
              buyerDni: event.target.value.replace(/\D/g, "").slice(0, 9),
            })
          }
          placeholder="Solo números"
          className={inputClass(Boolean(dniError), "buyerDni")}
        />
        <FieldHint id="buyer-dni-error" message={dniError} />
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor={CHECKOUT_BUYER_FIELD_IDS.buyerPhone}
          className="inline-flex min-h-11 items-center gap-1.5 text-foreground"
        >
          <Phone className="size-3.5" aria-hidden="true" />
          Teléfono / WhatsApp
        </Label>
        <Input
          id={CHECKOUT_BUYER_FIELD_IDS.buyerPhone}
          name="buyerPhone"
          type="tel"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="tel"
          disabled={disabled}
          value={value.buyerPhone}
          aria-invalid={Boolean(phoneError)}
          aria-describedby={phoneError ? "buyer-phone-error" : undefined}
          onChange={(event) =>
            onChange({
              ...value,
              buyerPhone: event.target.value.replace(/\D/g, "").slice(0, 15),
            })
          }
          placeholder="Ej. 1123456789"
          className={inputClass(Boolean(phoneError), "buyerPhone")}
        />
        <FieldHint id="buyer-phone-error" message={phoneError} />
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor={CHECKOUT_BUYER_FIELD_IDS.buyerEmail}
          className="inline-flex min-h-11 items-center gap-1.5 text-foreground"
        >
          <Mail className="size-3.5" aria-hidden="true" />
          Tu Email
        </Label>
        <Input
          id={CHECKOUT_BUYER_FIELD_IDS.buyerEmail}
          name="buyerEmail"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="email"
          disabled={disabled}
          value={value.buyerEmail}
          aria-invalid={Boolean(emailError)}
          aria-describedby={emailError ? "buyer-email-error" : undefined}
          onChange={(event) =>
            onChange({ ...value, buyerEmail: event.target.value })
          }
          placeholder="tunombre@email.com"
          className={inputClass(Boolean(emailError), "buyerEmail")}
        />
        <FieldHint id="buyer-email-error" message={emailError} />
      </div>
    </div>
  )
}

function FieldHint({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} role="status" className="text-xs text-muted-foreground">
      {message}
    </p>
  )
}
