"use client"

import { IdCard, Mail, Phone, User } from "lucide-react"
import { useEffect, useMemo } from "react"
import type { FieldErrors } from "react-hook-form"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { CheckoutBuyerInfo } from "@/lib/checkout-buyer"
import { suggestEmailTypo } from "@/lib/checkout/guest-input"
import { markCheckoutDwellStart } from "@/lib/checkout/client-security"
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
  "h-12 w-full min-w-0 rounded-xl border border-border bg-secondary/30 px-4 text-[16px] text-foreground placeholder:text-muted-foreground transition-all focus-visible:ring-2 focus-visible:ring-primary/50 md:h-14 md:text-base"

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

function splitBuyerName(full: string) {
  const trimmed = full.trim()
  const space = trimmed.indexOf(" ")
  if (space === -1) return { first: trimmed, last: "" }
  return { first: trimmed.slice(0, space), last: trimmed.slice(space + 1) }
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
  const names = splitBuyerName(value.buyerName)
  const emailSuggestion = useMemo(
    () => suggestEmailTypo(value.buyerEmail),
    [value.buyerEmail],
  )
  const shakeClass =
    shakeSignal > 0
      ? shakeSignal % 2 === 0
        ? "animate-checkout-shake-a"
        : "animate-checkout-shake-b"
      : null

  useEffect(() => {
    markCheckoutDwellStart()
  }, [])

  function inputClass(invalid: boolean, field: keyof CheckoutBuyerInfo) {
    const firstInvalid =
      (emailError && field === "buyerEmail") ||
      (!emailError && nameError && field === "buyerName") ||
      (!emailError && !nameError && dniError && field === "buyerDni") ||
      (!emailError && !nameError && !dniError && phoneError && field === "buyerPhone")
    return cn(
      fieldInputClass,
      invalid &&
        "border-destructive/60 bg-destructive/5 text-foreground focus-visible:ring-destructive/40",
      invalid && firstInvalid && shakeClass,
    )
  }

  function setNamePart(part: "first" | "last", next: string) {
    const first = part === "first" ? next : names.first
    const last = part === "last" ? next : names.last
    onChange({ ...value, buyerName: `${first} ${last}`.trim() })
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-5", className)}>
      <div className="min-w-0 space-y-1.5">
        <Label
          htmlFor={CHECKOUT_BUYER_FIELD_IDS.buyerEmail}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground"
        >
          <Mail className="size-3.5" aria-hidden="true" />
          Mail
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
        {emailSuggestion ? (
          <button
            type="button"
            className="break-words text-left text-xs font-medium whitespace-normal text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-300"
            onClick={() => onChange({ ...value, buyerEmail: emailSuggestion })}
          >
            ¿Quisiste decir {emailSuggestion}?
          </button>
        ) : null}
        <FieldHint id="buyer-email-error" message={emailError} />
      </div>

      <div className="grid min-w-0 gap-5 sm:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label
            htmlFor={CHECKOUT_BUYER_FIELD_IDS.buyerName}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground"
          >
            <User className="size-3.5" aria-hidden="true" />
            Nombre
          </Label>
          <Input
            id={CHECKOUT_BUYER_FIELD_IDS.buyerName}
            name="buyerFirstName"
            autoComplete="given-name"
            autoCapitalize="words"
            disabled={disabled}
            value={names.first}
            aria-invalid={Boolean(nameError)}
            aria-describedby={nameError ? "buyer-name-error" : undefined}
            onChange={(event) => setNamePart("first", event.target.value)}
            placeholder="Ana"
            className={inputClass(Boolean(nameError), "buyerName")}
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label
            htmlFor="buyer-last-name"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground"
          >
            Apellido
          </Label>
          <Input
            id="buyer-last-name"
            name="buyerLastName"
            autoComplete="family-name"
            autoCapitalize="words"
            disabled={disabled}
            value={names.last}
            aria-invalid={Boolean(nameError)}
            onChange={(event) => setNamePart("last", event.target.value)}
            placeholder="Pérez"
            className={inputClass(Boolean(nameError), "buyerName")}
          />
        </div>
      </div>
      <FieldHint id="buyer-name-error" message={nameError} />

      <div className="min-w-0 space-y-1.5">
        <Label
          htmlFor={CHECKOUT_BUYER_FIELD_IDS.buyerDni}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground"
        >
          <IdCard className="size-3.5" aria-hidden="true" />
          DNI
        </Label>
        <Input
          id={CHECKOUT_BUYER_FIELD_IDS.buyerDni}
          name="buyerDni"
          type="text"
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
              buyerDni: event.target.value.replace(/\D/g, "").slice(0, 8),
            })
          }
          placeholder="Solo números"
          className={inputClass(Boolean(dniError), "buyerDni")}
        />
        <FieldHint id="buyer-dni-error" message={dniError} />
      </div>

      <div className="min-w-0 space-y-1.5">
        <Label
          htmlFor={CHECKOUT_BUYER_FIELD_IDS.buyerPhone}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground"
        >
          <Phone className="size-3.5" aria-hidden="true" />
          Teléfono
        </Label>
        <Input
          id={CHECKOUT_BUYER_FIELD_IDS.buyerPhone}
          name="buyerPhone"
          type="text"
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
          placeholder="11 2345 6789"
          className={inputClass(Boolean(phoneError), "buyerPhone")}
        />
        <p className="break-words text-sm whitespace-normal text-foreground/80">
          Celular argentino. Se guarda como +549...
        </p>
        <FieldHint id="buyer-phone-error" message={phoneError} />
      </div>
    </div>
  )
}

function FieldHint({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} role="status" className="text-sm font-medium text-destructive">
      {message}
    </p>
  )
}
