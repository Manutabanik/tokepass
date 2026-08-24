"use client"

import { Plus } from "lucide-react"
import { useState } from "react"
import type { UseFieldArrayUpdate, UseFormReturn } from "react-hook-form"

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
import { formatCurrency } from "@/lib/format"
import { formatInventoryDayOption } from "@/lib/event-schedule"
import { asPositiveInt, parseStrictInt } from "@/lib/inventory/capacity-budget"
import { normalizeTicketRow } from "@/lib/inventory/normalize-ticket-row"
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

export function commitTicketFamily(input: {
  form: UseFormReturn<EventFormValues>
  update: UseFieldArrayUpdate<EventFormValues, "tickets">
  indexes: number[]
  kind: "general" | "map"
  differentiate: boolean
}) {
  const { form, update, indexes, kind, differentiate } = input
  const current = form.getValues("tickets") ?? []
  const primaryIndex = indexes[0]
  const primary =
    primaryIndex == null ? undefined : current[primaryIndex]
  if (!primary) return

  const normalizedPrimary = normalizeTicketRow(primary)
  const sharedName =
    normalizedPrimary.name.trim() || "Entrada general"
  const sharedCapacity = normalizedPrimary.capacity
  const sharedPrice = normalizedPrimary.price
  const sharedBasePrice = normalizedPrimary.basePrice

  for (const index of indexes) {
    const ticket = current[index]
    if (!ticket) continue
    const normalized = normalizeTicketRow(ticket)
    update(index, {
      ...ticket,
      name:
        kind === "map"
          ? normalized.name
          : differentiate
            ? normalized.name || sharedName
            : sharedName,
      capacity:
        kind === "map"
          ? normalized.capacity
          : differentiate
            ? normalized.capacity
            : sharedCapacity,
      price: differentiate ? normalized.price : sharedPrice,
      basePrice: differentiate ? normalized.basePrice : sharedBasePrice,
      minPurchaseLimit: normalized.minPurchaseLimit,
      maxPurchaseLimit: normalized.maxPurchaseLimit,
    })
  }
}

export function TicketEditorSheet({
  form,
  update,
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
  update: UseFieldArrayUpdate<EventFormValues, "tickets">
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

  function patchTicket(
    index: number,
    patch: Partial<EventFormValues["tickets"][number]>,
  ) {
    const current = form.getValues(`tickets.${index}`)
    if (!current) return
    const merged = { ...current, ...patch }
    if ("capacity" in patch) {
      merged.capacity = Number(merged.capacity) || 0
    }
    if ("price" in patch) {
      merged.price = Number(merged.price) || 0
    }
    if ("basePrice" in patch) {
      merged.basePrice = Number(merged.basePrice) || 0
    }
    update(index, merged)
  }

  function syncField(
    field: "name" | "capacity" | "price" | "basePrice" | "minPurchaseLimit" | "maxPurchaseLimit",
    value: string | number | null | undefined,
  ) {
    for (const index of indexes) {
      patchTicket(index, { [field]: value } as Partial<
        EventFormValues["tickets"][number]
      >)
    }
  }

  function writeNet(index: number, net: number, allDays = false) {
    const current = form.getValues("tickets") ?? []
    const ticket = current[index]
    if (!ticket) return
    const next = applyNetProfitToTicket(ticket, net, feePercentage)
    update(index, {
      ...ticket,
      ...next,
      calculationMode: "net_income",
      feeStrategy: "pass_to_customer",
    })
    if (allDays) {
      for (const other of indexes) {
        if (other === index) continue
        const row = current[other]
        if (!row) continue
        const mapped = applyNetProfitToTicket(row, net, feePercentage)
        update(other, {
          ...row,
          ...mapped,
          calculationMode: "net_income",
          feeStrategy: "pass_to_customer",
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
              ? "El stock y precio de este sector se gestionan directamente desde el editor del mapa."
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
                    El stock y precio de este sector se gestionan directamente desde
                    el editor del mapa ({asPositiveInt(field.value)} lugares).
                  </p>
                ) : null}
                <FormMessage>{fieldState.error?.message}</FormMessage>
              </FormItem>
            )}
          />

          {!differentiate || !showDays ? (
            mapLocked ? (
              <FormItem>
                <FormLabel className={STUDIO_LABEL_CLASS}>Precio público</FormLabel>
                <Input
                  disabled
                  readOnly
                  value={formatCurrency(Number(watchedTickets?.[primaryIndex]?.price) || 0)}
                  className={cn(STUDIO_CONTROL_CLASS, "tabular-nums")}
                />
                <FormDescription className="text-[11px]">
                  El stock y precio de este sector se gestionan directamente desde
                  el editor del mapa.
                </FormDescription>
              </FormItem>
            ) : (
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
            )
          ) : null}

          {showDays && !mapLocked ? (
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
                        Mínimo por compra
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
                        Máximo por compra
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
