"use client"

import { Plus } from "lucide-react"
import { useState } from "react"
import type { UseFormReturn } from "react-hook-form"

import { NetProfitCalculator } from "@/components/admin/events/net-profit-calculator"
import { Button } from "@/components/ui/button"
import {
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
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
  familyHasDifferentiatedPrices,
  ticketSoldCount,
  TIER_HAS_SALES_LOCK_HINT,
} from "@/lib/inventory/synced-day-tickets"
import {
  applyNetProfitToTicket,
  clampServiceFeePercentage,
  resolveTicketNetProfit,
} from "@/lib/pricing/net-profit"
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
  const feePercentage = clampServiceFeePercentage(
    form.watch("serviceFeePercentage"),
  )
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
  const [showPurchaseRules, setShowPurchaseRules] = useState(() => {
    const ticket = primaryIndex == null ? null : form.getValues(`tickets.${primaryIndex}`)
    return (
      Number(ticket?.minPurchaseLimit) > 1 ||
      (ticket?.maxPurchaseLimit != null && Number(ticket.maxPurchaseLimit) > 0)
    )
  })

  function syncField(
    field: "name" | "capacity" | "price" | "basePrice" | "minPurchaseLimit" | "maxPurchaseLimit",
    value: string | number | null | undefined,
  ) {
    for (const index of indexes) {
      form.setValue(`tickets.${index}.${field}`, value as never, {
        shouldDirty: true,
        shouldValidate: true,
      })
    }
  }

  function writeNet(index: number, net: number, allDays = false) {
    const current = form.getValues("tickets") ?? []
    const ticket = current[index]
    if (!ticket) return
    const next = applyNetProfitToTicket(ticket, net, feePercentage)
    form.setValue(`tickets.${index}.basePrice`, next.basePrice, {
      shouldDirty: true,
      shouldValidate: true,
    })
    form.setValue(`tickets.${index}.price`, next.price, {
      shouldDirty: true,
      shouldValidate: true,
    })
    form.setValue(`tickets.${index}.calculationMode`, "net_income", {
      shouldDirty: true,
    })
    form.setValue(`tickets.${index}.feeStrategy`, "pass_to_customer", {
      shouldDirty: true,
    })
    if (allDays) {
      for (const other of indexes) {
        if (other === index) continue
        const row = current[other]
        if (!row) continue
        const mapped = applyNetProfitToTicket(row, net, feePercentage)
        form.setValue(`tickets.${other}.basePrice`, mapped.basePrice, {
          shouldDirty: true,
          shouldValidate: true,
        })
        form.setValue(`tickets.${other}.price`, mapped.price, {
          shouldDirty: true,
          shouldValidate: true,
        })
      }
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
              ? "El aforo lo define el mapa. Acá cargás la ganancia neta y el precio público se calcula solo."
              : "Nombre, aforo y ganancia neta. El precio al público incluye la comisión."}
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

          {!differentiate || !showDays ? (
            <FormField
              control={form.control}
              name={`tickets.${primaryIndex}.price`}
              render={({ fieldState }) => (
                <FormItem>
                  <NetProfitCalculator
                    name={`tickets.${primaryIndex}.basePrice`}
                    netPrice={resolveTicketNetProfit(
                      watchedTickets?.[primaryIndex] ?? {},
                      feePercentage,
                    )}
                    onNetChange={(net) =>
                      writeNet(primaryIndex, net, !differentiate)
                    }
                    feePercentage={feePercentage}
                    invalid={Boolean(fieldState.error)}
                    error={fieldState.error?.message}
                  />
                </FormItem>
              )}
            />
          ) : null}

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
                      const net = resolveTicketNetProfit(
                        form.getValues(`tickets.${primaryIndex}`) ?? {},
                        feePercentage,
                      )
                      writeNet(primaryIndex, net, true)
                    }
                  }}
                  aria-label="Diferenciar precios por día"
                />
              </label>
              {differentiate ? (
                <div className="space-y-4">
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
                        render={({ fieldState }) => (
                          <FormItem>
                            <FormLabel className={STUDIO_LABEL_CLASS}>
                              {formatInventoryDayOption(day, dayIndex)}
                            </FormLabel>
                            <NetProfitCalculator
                              name={`tickets.${ticketIndex}.basePrice`}
                              netPrice={resolveTicketNetProfit(
                                watchedTickets?.[ticketIndex] ?? {},
                                feePercentage,
                              )}
                              onNetChange={(net) => writeNet(ticketIndex, net)}
                              feePercentage={feePercentage}
                              invalid={Boolean(fieldState.error)}
                              error={fieldState.error?.message}
                            />
                          </FormItem>
                        )}
                      />
                    )
                  })}
                </div>
              ) : (
                <p className="text-[11px] leading-5 text-muted-foreground">
                  La ganancia neta se aplica a los {days.length} días. Encendé el
                  interruptor solo si un día vale distinto.
                </p>
              )}
            </div>
          ) : null}

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setShowPurchaseRules((open) => !open)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-foreground"
              aria-expanded={showPurchaseRules}
            >
              <Plus
                className={cn(
                  "size-3 transition-transform",
                  showPurchaseRules && "rotate-45",
                )}
                aria-hidden="true"
              />
              {showPurchaseRules ? "Ocultar reglas de compra" : "Reglas de compra"}
            </button>
            {showPurchaseRules ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name={`tickets.${primaryIndex}.minPurchaseLimit`}
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel className={STUDIO_LABEL_CLASS}>
                        Mínimo de tickets por compra
                      </FormLabel>
                      <Input
                        inputMode="numeric"
                        value={
                          field.value == null || Number.isNaN(Number(field.value))
                            ? "1"
                            : String(field.value)
                        }
                        onChange={(event) => {
                          const parsed = parseStrictInt(event.target.value)
                          if (parsed === "") {
                            field.onChange(1)
                            syncField("minPurchaseLimit", 1)
                            return
                          }
                          if (typeof parsed === "number" && !Number.isNaN(parsed)) {
                            const next = Math.max(1, parsed)
                            field.onChange(next)
                            syncField("minPurchaseLimit", next)
                          }
                        }}
                        className={cn(STUDIO_CONTROL_CLASS, "tabular-nums")}
                      />
                      <FormMessage>{fieldState.error?.message}</FormMessage>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`tickets.${primaryIndex}.maxPurchaseLimit`}
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel className={STUDIO_LABEL_CLASS}>
                        Máximo de tickets por compra
                      </FormLabel>
                      <Input
                        inputMode="numeric"
                        placeholder="Sin tope"
                        value={
                          field.value == null || Number.isNaN(Number(field.value))
                            ? ""
                            : String(field.value)
                        }
                        onChange={(event) => {
                          const parsed = parseStrictInt(event.target.value)
                          if (parsed === "") {
                            field.onChange(null)
                            syncField("maxPurchaseLimit", null)
                            return
                          }
                          if (typeof parsed === "number" && !Number.isNaN(parsed)) {
                            field.onChange(parsed)
                            syncField("maxPurchaseLimit", parsed)
                          }
                        }}
                        className={cn(STUDIO_CONTROL_CLASS, "tabular-nums")}
                      />
                      <FormDescription className="text-[11px]">
                        Vacío = sin máximo por compra.
                      </FormDescription>
                      <FormMessage>{fieldState.error?.message}</FormMessage>
                    </FormItem>
                  )}
                />
              </div>
            ) : null}
          </div>
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
