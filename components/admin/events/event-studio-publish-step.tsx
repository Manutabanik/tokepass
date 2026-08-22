"use client"

import { Building2, CreditCard, Globe2, Lock, Plus } from "lucide-react"
import { useState } from "react"
import type { UseFormReturn } from "react-hook-form"

import { AgendaBuilder } from "@/components/admin/agenda-builder"
import { EventStudioPurchaseCapField } from "@/components/admin/events/event-studio-purchase-cap-field"
import {
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Switch } from "@/components/ui/switch"
import {
  STUDIO_LABEL_CLASS,
} from "@/lib/admin/studio-form-styles"
import type { TicketFeeStrategy } from "@/lib/pricing/flexible-pricing"
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
  eventId,
  hasSchedule,
}: {
  form: UseFormReturn<EventFormValues>
  eventId?: string | null
  hasSchedule: boolean
}) {
  const [showBillingRules, setShowBillingRules] = useState(() => {
    const values = form.getValues()
    return (
      values.defaultFeeStrategy === "pass_to_customer" ||
      (values.refundPolicy != null && values.refundPolicy !== "organizer") ||
      Boolean(values.basics.hasSchedule)
    )
  })

  function applyFeeStrategy(next: TicketFeeStrategy) {
    form.setValue("defaultFeeStrategy", next, { shouldDirty: true })
    const tickets = form.getValues("tickets") ?? []
    form.setValue(
      "tickets",
      tickets.map((tier) => ({ ...tier, feeStrategy: next })),
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

      <EventStudioPurchaseCapField form={form} />

      <FormField
        control={form.control}
        name="acceptsMercadoPago"
        render={() => (
          <FormItem className="space-y-3">
            <FormLabel className={cn(STUDIO_LABEL_CLASS, "block")}>
              Medios de cobro
            </FormLabel>
            <div className="grid gap-3 sm:grid-cols-2">
              <PaymentMethodCheckbox
                form={form}
                name="acceptsMercadoPago"
                title="Mercado Pago"
                description="Pago online con tarjeta, débito y dinero en cuenta."
                icon={CreditCard}
              />
              <PaymentMethodCheckbox
                form={form}
                name="acceptsPosPayments"
                title="Transferencia / POS"
                description="Cobro en boletería: efectivo, tarjeta o transferencia."
                icon={Building2}
              />
            </div>
            <FormMessage />
          </FormItem>
        )}
      />

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
            : "Reglas de Facturación avanzadas"}
        </button>

        {showBillingRules ? (
          <div className="space-y-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
            <FormField
              control={form.control}
              name="defaultFeeStrategy"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={STUDIO_LABEL_CLASS}>
                    Absorción de service fee
                  </FormLabel>
                  <FormDescription>
                    Se aplica a todas las entradas. El comprador ve un precio
                    redondo o paga la comisión aparte.
                  </FormDescription>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {(
                      [
                        {
                          value: "absorb_in_price" as const,
                          label: "Hacerme cargo",
                          hint: "La comisión sale de tu precio de venta.",
                        },
                        {
                          value: "pass_to_customer" as const,
                          label: "Recargar al comprador",
                          hint: "El cliente paga tu precio + la comisión.",
                        },
                      ] as const
                    ).map((option) => {
                      const selected = field.value === option.value
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => applyFeeStrategy(option.value)}
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
                      const selected = (field.value ?? "organizer") === option.value
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

            <FormField
              control={form.control}
              name="basics.hasSchedule"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/50">
                  <div className="min-w-0">
                    <FormLabel className="mb-0 text-sm font-bold text-slate-800 dark:text-zinc-200">
                      Cronograma / agenda
                    </FormLabel>
                    <FormDescription className="text-xs text-muted-foreground">
                      Charlas, shows o itinerario por horarios.
                    </FormDescription>
                  </div>
                  <Switch
                    checked={Boolean(field.value)}
                    onCheckedChange={field.onChange}
                    className="data-checked:bg-violet-500"
                    aria-label="Habilitar cronograma o agenda del evento"
                  />
                </FormItem>
              )}
            />

            {hasSchedule ? (
              <AgendaBuilder eventId={eventId} />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function PaymentMethodCheckbox({
  form,
  name,
  title,
  description,
  icon: Icon,
}: {
  form: UseFormReturn<EventFormValues>
  name: "acceptsMercadoPago" | "acceptsPosPayments"
  title: string
  description: string
  icon: typeof CreditCard
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <label
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition",
            field.value
              ? "border-emerald-500 bg-emerald-500/10"
              : "border-border bg-muted/20 hover:bg-muted/40",
          )}
        >
          <input
            type="checkbox"
            checked={Boolean(field.value)}
            onChange={(event) => field.onChange(event.target.checked)}
            className="mt-1 size-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span className="min-w-0">
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Icon className="size-4 shrink-0 text-primary" />
              {title}
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
              {description}
            </span>
          </span>
        </label>
      )}
    />
  )
}
