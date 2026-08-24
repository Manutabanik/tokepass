"use client"

import type { UseFormReturn } from "react-hook-form"

import {
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
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

export function EventStudioServiceFeeField({
  form,
}: {
  form: UseFormReturn<EventFormValues>
}) {
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
              if (field.value == null || !Number.isFinite(Number(field.value))) {
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
  )
}
