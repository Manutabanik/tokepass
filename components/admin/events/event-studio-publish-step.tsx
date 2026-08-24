"use client"

import { Globe2, Lock } from "lucide-react"
import type { UseFormReturn } from "react-hook-form"

import {
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Switch } from "@/components/ui/switch"
import { STUDIO_LABEL_CLASS } from "@/lib/admin/studio-form-styles"
import { REFUND_POLICY_OPTIONS } from "@/lib/events/refund-policy"
import type { EventFormValues } from "@/lib/validations/event-form"
import { cn } from "@/lib/utils"

export function EventStudioPublishStep({
  form,
}: {
  form: UseFormReturn<EventFormValues>
  eventId?: string | null
}) {
  return (
    <div className="flex flex-col gap-y-6">
      <div className="flex flex-col gap-y-2">
        <h2 className="hidden text-xl font-bold text-foreground sm:block">
          Publicar y cobrar
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Definí quién puede ver el evento, cómo cobrás y la política de
          devolución.
        </p>
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
        name="refundPolicy"
        render={({ field }) => (
          <FormItem>
            <FormLabel className={STUDIO_LABEL_CLASS}>
              Políticas de devolución
            </FormLabel>
            <div className="mt-2 grid gap-2">
              {REFUND_POLICY_OPTIONS.map((option) => {
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
