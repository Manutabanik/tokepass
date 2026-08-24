"use client"

import { Globe2, Lock, Plus } from "lucide-react"
import { useState } from "react"
import type { UseFormReturn } from "react-hook-form"

import { EventStudioPurchaseCapField } from "@/components/admin/events/event-studio-purchase-cap-field"
import {
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  STUDIO_CONTROL_CLASS,
  STUDIO_LABEL_CLASS,
} from "@/lib/admin/studio-form-styles"
import {
  clampServiceFeePercentage,
  remapTicketsForServiceFee,
} from "@/lib/pricing/net-profit"
import type { EventFormValues } from "@/lib/validations/event-form"
import { cn } from "@/lib/utils"

const REFUND_OPTIONS = [
  {
    value: "organizer" as const,
    label: "A criterio del organizador",
    hint: "Las devoluciones se resuelven caso por caso.",
  },
  {
    value: "no_refunds" as const,
    label: "Sin devoluciones",
    hint: "Salvo cancelación del evento.",
  },
  {
    value: "until_24h" as const,
    label: "Hasta 24 h antes",
    hint: "Después de ese plazo no hay reembolso.",
  },
]

export function EventStudioPublishStep({
  form,
}: {
  form: UseFormReturn<EventFormValues>
  eventId?: string | null
}) {
  const [showBillingRules, setShowBillingRules] = useState(() => {
    const values = form.getValues()
    return values.refundPolicy != null && values.refundPolicy !== "organizer"
  })

  function applyServiceFeePercentage(next: number) {
    const percentage = clampServiceFeePercentage(next)
    form.setValue("serviceFeePercentage", percentage, {
      shouldDirty: true,
      shouldValidate: true,
    })
    form.setValue(
      "tickets",
      remapTicketsForServiceFee(form.getValues("tickets") ?? [], percentage),
      { shouldDirty: true },
    )
  }

  return (
    <div className="flex flex-col gap-y-6">
      <div className="flex flex-col gap-y-2">
        <h2 className="hidden text-xl font-bold text-foreground sm:block">
          Publicar y cobrar
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Definí el tope por persona, cómo cobrás y quién puede ver el evento.
        </p>
      </div>

      <FormField
        control={form.control}
        name="serviceFeePercentage"
        render={({ field, fieldState }) => (
          <FormItem>
            <FormLabel className={STUDIO_LABEL_CLASS}>
              Comisión de la plataforma (%)
            </FormLabel>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={95}
              step={0.5}
              name={field.name}
              aria-invalid={Boolean(fieldState.error)}
              value={
                field.value == null || Number.isNaN(Number(field.value))
                  ? ""
                  : String(field.value)
              }
              onChange={(event) => {
                const raw = event.target.value
                if (raw.trim() === "") {
                  field.onChange(undefined)
                  return
                }
                const parsed = Number(raw)
                if (!Number.isFinite(parsed)) return
                applyServiceFeePercentage(parsed)
              }}
              onBlur={() => {
                field.onBlur()
                if (
                  field.value == null ||
                  !Number.isFinite(Number(field.value))
                ) {
                  applyServiceFeePercentage(15)
                }
              }}
              placeholder="15"
              className={cn(STUDIO_CONTROL_CLASS, "max-w-40 tabular-nums")}
            />
            <FormDescription>
              Este porcentaje se sumará al precio neto de las entradas para
              calcular el precio final al público.
            </FormDescription>
            <FormMessage>{fieldState.error?.message}</FormMessage>
          </FormItem>
        )}
      />

      <EventStudioPurchaseCapField form={form} />

      <div className="space-y-3">
        <FormLabel className={cn(STUDIO_LABEL_CLASS, "block")}>
          Medios de cobro
        </FormLabel>
        <PaymentMethodSwitch
          form={form}
          name="acceptsMercadoPago"
          title="Mercado Pago"
          description="Pago online con tarjeta, débito y dinero en cuenta."
        />
        <PaymentMethodSwitch
          form={form}
          name="acceptsPosPayments"
          title="Transferencia / POS"
          description="Cobro en boletería: efectivo, tarjeta o transferencia."
        />
        <FormMessage />
      </div>

      <FormField
        control={form.control}
        name="basics.visibility"
        render={({ field }) => (
          <FormItem>
            <FormLabel className={cn(STUDIO_LABEL_CLASS, "block")}>
              Visibilidad del evento
            </FormLabel>
            <div className="inline-flex w-full rounded-2xl bg-muted/20 p-1.5 sm:w-auto">
              {(
                [
                  {
                    value: "public" as const,
                    label: "Público",
                    hint: "Aparece en TokePass cuando esté a la venta",
                    icon: Globe2,
                  },
                  {
                    value: "private" as const,
                    label: "Solo link",
                    hint: "No aparece en portada. Entra quien tenga el enlace",
                    icon: Lock,
                  },
                ] as const
              ).map((option) => {
                const selected = field.value === option.value
                const Icon = option.icon
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => field.onChange(option.value)}
                    className={cn(
                      "flex flex-1 items-center gap-2 rounded-xl px-4 py-2.5 text-left text-sm transition-all",
                      selected
                        ? "bg-background font-medium text-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-4 shrink-0",
                        selected ? "text-primary" : "text-muted-foreground",
                      )}
                      aria-hidden="true"
                    />
                    <span>
                      <span className="block font-medium">{option.label}</span>
                      <span className="block text-xs leading-relaxed text-muted-foreground">
                        {option.hint}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </FormItem>
        )}
      />

      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setShowBillingRules((open) => !open)}
          className={cn(
            "inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-3 text-sm font-semibold transition",
            "border-slate-300 text-slate-700 hover:border-emerald-400 hover:bg-emerald-50/60",
            "dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-emerald-500/50 dark:hover:bg-emerald-950/20",
          )}
          aria-expanded={showBillingRules}
        >
          <Plus
            className={cn(
              "size-4 transition-transform",
              showBillingRules && "rotate-45",
            )}
            aria-hidden
          />
          {showBillingRules
            ? "Ocultar reglas de facturación"
            : "Mostrar reglas de facturación"}
        </button>

        {showBillingRules ? (
          <div className="space-y-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
            <FormField
              control={form.control}
              name="refundPolicy"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={STUDIO_LABEL_CLASS}>
                    Políticas de devolución
                  </FormLabel>
                  <div className="mt-2 grid gap-2">
                    {REFUND_OPTIONS.map((option) => {
                      const selected =
                        (field.value ?? "organizer") === option.value
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => field.onChange(option.value)}
                          className={cn(
                            "rounded-2xl px-4 py-3 text-left transition",
                            selected
                              ? "border border-emerald-500 bg-emerald-500/10 text-foreground"
                              : "border border-transparent bg-background text-muted-foreground hover:bg-muted",
                          )}
                        >
                          <span className="block text-sm font-semibold">
                            {option.label}
                          </span>
                          <span className="mt-1 block text-xs leading-relaxed">
                            {option.hint}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </FormItem>
              )}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function PaymentMethodSwitch({
  form,
  name,
  title,
  description,
}: {
  form: UseFormReturn<EventFormValues>
  name: "acceptsMercadoPago" | "acceptsPosPayments"
  title: string
  description: string
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40">
          <div className="min-w-0">
            <FormLabel className="mb-0 text-sm font-bold text-slate-800 dark:text-zinc-200">
              {title}
            </FormLabel>
            <FormDescription className="text-xs text-muted-foreground">
              {description}
            </FormDescription>
          </div>
          <Switch
            checked={Boolean(field.value)}
            onCheckedChange={field.onChange}
            className="data-checked:bg-emerald-500"
            aria-label={title}
          />
        </FormItem>
      )}
    />
  )
}
