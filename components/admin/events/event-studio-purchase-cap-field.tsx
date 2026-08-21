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
          <FormLabel className="mb-1.5 text-sm font-semibold text-foreground/90">
            Límite de entradas por persona
          </FormLabel>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Ej: máximo 4 por compra. Si una entrada no tiene su propio tope,
            usa este. Vacío = sin límite por defecto.
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
            className="mt-2 h-12 max-w-[12rem] rounded-xl border-border/60 bg-muted/20 px-4 text-base tabular-nums transition-all focus:bg-background sm:h-13"
          />
          <FormMessage>{fieldState.error?.message}</FormMessage>
        </FormItem>
      )}
    />
  )
}
