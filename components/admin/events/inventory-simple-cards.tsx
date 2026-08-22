"use client"

import { Trash2 } from "lucide-react"
import type { UseFormReturn } from "react-hook-form"

import { Button } from "@/components/ui/button"
import {
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { PriceInput } from "@/components/ui/price-input"
import {
  STUDIO_CONTROL_CLASS,
  STUDIO_LABEL_CLASS,
} from "@/lib/admin/studio-form-styles"
import { asPositiveInt, parseStrictInt } from "@/lib/inventory/capacity-budget"
import type { EventFormValues } from "@/lib/validations/event-form"
import { cn } from "@/lib/utils"

function CompactNameField({
  form,
  index,
}: {
  form: UseFormReturn<EventFormValues>
  index: number
}) {
  return (
    <FormField
      control={form.control}
      name={`tickets.${index}.name`}
      render={({ field, fieldState }) => (
        <FormItem className="min-w-0">
          <FormLabel className={STUDIO_LABEL_CLASS}>Nombre</FormLabel>
          <Input
            {...field}
            value={field.value ?? ""}
            placeholder="General, VIP, Early bird…"
            aria-invalid={Boolean(fieldState.error)}
            className={STUDIO_CONTROL_CLASS}
          />
          <FormMessage>{fieldState.error?.message}</FormMessage>
        </FormItem>
      )}
    />
  )
}

function CompactPriceField({
  form,
  index,
}: {
  form: UseFormReturn<EventFormValues>
  index: number
}) {
  return (
    <FormField
      control={form.control}
      name={`tickets.${index}.price`}
      render={({ field, fieldState }) => (
        <FormItem className="min-w-0">
          <FormLabel className={STUDIO_LABEL_CLASS}>Precio</FormLabel>
          <PriceInput
            name={field.name}
            aria-invalid={Boolean(fieldState.error)}
            value={field.value}
            onValueChange={field.onChange}
            placeholder="0"
            allowEmpty
            className={cn(STUDIO_CONTROL_CLASS, "font-semibold tabular-nums")}
          />
          <FormMessage>{fieldState.error?.message}</FormMessage>
        </FormItem>
      )}
    />
  )
}

export function GeneralAdmissionCard({
  form,
  index,
  onRemove,
}: {
  form: UseFormReturn<EventFormValues>
  index: number
  onRemove: () => void
}) {
  return (
    <article className="rounded-2xl border border-border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_auto]">
        <CompactNameField form={form} index={index} />
        <CompactPriceField form={form} index={index} />
        <FormField
          control={form.control}
          name={`tickets.${index}.capacity`}
          render={({ field, fieldState }) => (
            <FormItem className="min-w-0">
              <FormLabel className={STUDIO_LABEL_CLASS}>Stock</FormLabel>
              <Input
                inputMode="numeric"
                aria-invalid={Boolean(fieldState.error)}
                value={
                  field.value === undefined || field.value === null
                    ? ""
                    : String(field.value)
                }
                onChange={(event) => {
                  const parsed = parseStrictInt(event.target.value)
                  if (parsed === "") {
                    field.onChange(undefined)
                    return
                  }
                  if (!Number.isNaN(parsed)) field.onChange(parsed)
                }}
                placeholder="0"
                className={cn(STUDIO_CONTROL_CLASS, "tabular-nums")}
              />
              <FormMessage>{fieldState.error?.message}</FormMessage>
            </FormItem>
          )}
        />
        <div className="flex items-end justify-end">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            aria-label="Quitar entrada general"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </article>
  )
}

export function MapSectorCard({
  form,
  index,
}: {
  form: UseFormReturn<EventFormValues>
  index: number
}) {
  const name = form.watch(`tickets.${index}.name`)
  const capacity = form.watch(`tickets.${index}.capacity`)

  return (
    <article className="rounded-2xl border border-border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.9fr)]">
        <div className="min-w-0">
          <p className={STUDIO_LABEL_CLASS}>Sector</p>
          <p className="mt-2 truncate text-sm font-semibold text-foreground">
            {name?.trim() || "Sector del mapa"}
          </p>
        </div>
        <FormItem className="min-w-0">
          <FormLabel className={STUDIO_LABEL_CLASS}>Stock</FormLabel>
          <Input
            disabled
            readOnly
            value={String(asPositiveInt(capacity))}
            className={cn(STUDIO_CONTROL_CLASS, "tabular-nums")}
            aria-label="Capacidad del mapa"
          />
          <p className="text-[11px] text-muted-foreground">
            Lo define el mapa
          </p>
        </FormItem>
        <CompactPriceField form={form} index={index} />
      </div>
    </article>
  )
}
