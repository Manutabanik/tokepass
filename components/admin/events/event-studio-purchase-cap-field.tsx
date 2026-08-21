"use client"

import type { UseFormReturn } from "react-hook-form"

import {
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { parseStrictInt } from "@/lib/inventory/capacity-budget"
import type { EventFormValues } from "@/lib/validations/event-form"

export function EventStudioPurchaseCapField({
  form,
}: {
  form: UseFormReturn<EventFormValues>
}) {
  return (
    <FormField
      control={form.control}
      name="maxTicketsPerUser"
      render={({ field, fieldState }) => (
        <FormItem className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
          <FormLabel className="font-mono text-xs font-semibold uppercase tracking-wider text-foreground">
            Tope de compra por usuario
          </FormLabel>
          <p className="text-xs leading-5 text-muted-foreground">
            Fallback para tarifas sin máximo propio. El checkout valida cada
            tarifa por separado. Vacío = sin tope por defecto.
          </p>
          <Input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Sin límite"
            value={
              field.value == null || Number.isNaN(Number(field.value))
                ? ""
                : String(field.value)
            }
            onChange={(event) => {
              const parsed = parseStrictInt(event.target.value)
              if (parsed === "") {
                field.onChange(null)
                return
              }
              if (typeof parsed === "number" && Number.isNaN(parsed)) {
                return
              }
              field.onChange(typeof parsed === "number" ? parsed : null)
            }}
            className="mt-2 h-11 max-w-[12rem] text-base tabular-nums md:text-sm"
          />
          <FormMessage>{fieldState.error?.message}</FormMessage>
        </FormItem>
      )}
    />
  )
}
