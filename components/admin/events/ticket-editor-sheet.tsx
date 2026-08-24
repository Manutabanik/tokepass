"use client"

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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import {
  STUDIO_CONTROL_CLASS,
  STUDIO_LABEL_CLASS,
} from "@/lib/admin/studio-form-styles"
import { formatInventoryDayOption } from "@/lib/event-schedule"
import { asPositiveInt, parseStrictInt } from "@/lib/inventory/capacity-budget"
import {
  applyFamilyBasePrice,
  familyHasDifferentiatedPrices,
  ticketSoldCount,
  TIER_HAS_SALES_LOCK_HINT,
} from "@/lib/inventory/synced-day-tickets"
import type { EventFormValues } from "@/lib/validations/event-form"
import { cn } from "@/lib/utils"

type DayOption = EventFormValues["basics"]["scheduleDays"][number]

export function TicketEditorSheet({
  form,
  open,
  onOpenChange,
  indexes,
  kind,
  days,
  isMultiDay,
  differentiate,
  onDifferentiateChange,
}: {
  form: UseFormReturn<EventFormValues>
  open: boolean
  onOpenChange: (open: boolean) => void
  indexes: number[]
  kind: "general" | "map"
  days: DayOption[]
  isMultiDay: boolean
  differentiate: boolean
  onDifferentiateChange: (value: boolean) => void
}) {
  const primaryIndex = indexes[0]
  const mapLocked = kind === "map"
  const showDays = isMultiDay && days.length >= 2
  const watchedTickets = form.watch("tickets")
  const familySold = indexes.reduce(
    (sum, index) => sum + ticketSoldCount(watchedTickets?.[index]),
    0,
  )
  const indexByDay = new Map(
    indexes.map((index) => {
      const dayId = watchedTickets?.[index]?.dayId
      return [dayId ?? "", index] as const
    }),
  )

  function syncField(
    field: "name" | "capacity" | "price",
    value: string | number | undefined,
  ) {
    for (const index of indexes) {
      form.setValue(`tickets.${index}.${field}`, value as never, {
        shouldDirty: true,
      })
    }
  }

  if (primaryIndex == null) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[min(100%,26rem)] bg-background"
      >
        <SheetHeader>
          <SheetTitle>
            {mapLocked ? "Precio del sector" : "Entrada general"}
          </SheetTitle>
          <SheetDescription>
            {mapLocked
              ? "El aforo lo define el mapa. Acá solo se carga el precio."
              : "Nombre, aforo y precio. En eventos de varios días el precio se replica solo."}
            {familySold > 0 ? ` ${TIER_HAS_SALES_LOCK_HINT}` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
          <FormField
            control={form.control}
            name={`tickets.${primaryIndex}.name`}
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel className={STUDIO_LABEL_CLASS}>Nombre</FormLabel>
                <Input
                  {...field}
                  value={field.value ?? ""}
                  disabled={mapLocked}
                  placeholder="General, VIP, Early bird"
                  aria-invalid={Boolean(fieldState.error)}
                  className={STUDIO_CONTROL_CLASS}
                  onChange={(event) => {
                    field.onChange(event)
                    if (!mapLocked) syncField("name", event.target.value)
                  }}
                />
                <FormMessage>{fieldState.error?.message}</FormMessage>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name={`tickets.${primaryIndex}.capacity`}
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel className={STUDIO_LABEL_CLASS}>Aforo</FormLabel>
                <Input
                  inputMode="numeric"
                  disabled={mapLocked}
                  aria-invalid={Boolean(fieldState.error)}
                  value={
                    field.value === undefined || field.value === null
                      ? ""
                      : String(field.value)
                  }
                  onChange={(event) => {
                    if (mapLocked) return
                    const parsed = parseStrictInt(event.target.value)
                    if (parsed === "") {
                      field.onChange(undefined)
                      syncField("capacity", undefined)
                      return
                    }
                    if (!Number.isNaN(parsed)) {
                      field.onChange(parsed)
                      syncField("capacity", parsed)
                    }
                  }}
                  placeholder="0"
                  className={cn(STUDIO_CONTROL_CLASS, "tabular-nums")}
                />
                {mapLocked ? (
                  <p className="text-[11px] text-muted-foreground">
                    Lo define el dibujo del mapa ({asPositiveInt(field.value)}{" "}
                    lugares)
                  </p>
                ) : null}
                <FormMessage>{fieldState.error?.message}</FormMessage>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name={`tickets.${primaryIndex}.price`}
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel className={STUDIO_LABEL_CLASS}>Precio base</FormLabel>
                <PriceInput
                  name={field.name}
                  aria-invalid={Boolean(fieldState.error)}
                  value={field.value}
                  onValueChange={(value) => {
                    const next = value ?? 0
                    field.onChange(next)
                    if (!differentiate) syncField("price", next)
                    else {
                      form.setValue(`tickets.${primaryIndex}.basePrice`, next, {
                        shouldDirty: true,
                      })
                    }
                  }}
                  placeholder="0"
                  allowEmpty
                  className={cn(STUDIO_CONTROL_CLASS, "font-semibold tabular-nums")}
                />
                <FormMessage>{fieldState.error?.message}</FormMessage>
              </FormItem>
            )}
          />

          {showDays ? (
            <div className="space-y-3 rounded-xl border border-border/70 p-3">
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm text-foreground">
                  Diferenciar precios por día
                </span>
                <Switch
                  checked={differentiate}
                  onCheckedChange={(checked) => {
                    onDifferentiateChange(checked)
                    if (!checked) {
                      const base =
                        Number(form.getValues(`tickets.${primaryIndex}.price`)) ||
                        0
                      form.setValue(
                        "tickets",
                        applyFamilyBasePrice(
                          form.getValues("tickets") ?? [],
                          indexes,
                          base,
                        ),
                        { shouldDirty: true },
                      )
                    }
                  }}
                  aria-label="Diferenciar precios por día"
                />
              </label>
              {differentiate ? (
                <div className="space-y-3">
                  {days.map((day, dayIndex) => {
                    const ticketIndex =
                      indexByDay.get(day.id) ??
                      (dayIndex === 0 ? primaryIndex : undefined)
                    if (ticketIndex == null) return null
                    return (
                      <FormField
                        key={day.id}
                        control={form.control}
                        name={`tickets.${ticketIndex}.price`}
                        render={({ field, fieldState }) => (
                          <FormItem>
                            <FormLabel className={STUDIO_LABEL_CLASS}>
                              {formatInventoryDayOption(day, dayIndex)}
                            </FormLabel>
                            <PriceInput
                              name={field.name}
                              aria-invalid={Boolean(fieldState.error)}
                              value={field.value}
                              onValueChange={(value) =>
                                field.onChange(value ?? 0)
                              }
                              placeholder="0"
                              allowEmpty
                              className={cn(
                                STUDIO_CONTROL_CLASS,
                                "tabular-nums",
                              )}
                            />
                            <FormMessage>
                              {fieldState.error?.message}
                            </FormMessage>
                          </FormItem>
                        )}
                      />
                    )
                  })}
                </div>
              ) : (
                <p className="text-[11px] leading-5 text-muted-foreground">
                  El precio base se aplica a los {days.length} días. Encendé el
                  interruptor solo si un día vale distinto.
                </p>
              )}
            </div>
          ) : null}
        </div>

        <SheetFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Listo
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

export function sheetDifferentiateDefault(
  tickets: EventFormValues["tickets"],
  indexes: number[],
): boolean {
  return familyHasDifferentiatedPrices(tickets, indexes)
}
