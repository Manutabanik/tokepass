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
import {
  STUDIO_CONTROL_CLASS,
  STUDIO_LABEL_CLASS,
} from "@/lib/admin/studio-form-styles"
import { parseStrictInt } from "@/lib/inventory/capacity-budget"
import { ticketSoldCount, TIER_HAS_SALES_LOCK_HINT } from "@/lib/inventory/synced-day-tickets"
import {
  applyNetProfitToTicket,
  clampServiceFeePercentage,
  resolveTicketNetProfit,
} from "@/lib/pricing/net-profit"
import type { EventFormValues } from "@/lib/validations/event-form"
import { cn } from "@/lib/utils"

export function AddonEditorSheet({
  form,
  update,
  open,
  onOpenChange,
  index,
  feePercentage = 15,
  fixedFee = 0,
  isSponsored = false,
}: {
  form: UseFormReturn<EventFormValues>
  update: UseFieldArrayUpdate<EventFormValues, "tickets">
  open: boolean
  onOpenChange: (open: boolean) => void
  index: number
  feePercentage?: number
  fixedFee?: number
  isSponsored?: boolean
}) {
  const watchedTickets = form.watch("tickets")
  const ticket = watchedTickets?.[index]
  const resolvedFee = clampServiceFeePercentage(feePercentage)
  const extras = { fixedFee, sponsored: isSponsored }
  const sold = ticketSoldCount(ticket)
  const [showPurchaseRules, setShowPurchaseRules] = useState(() => {
    const row = form.getValues(`tickets.${index}`)
    return (
      Number(row?.minPurchaseLimit) > 1 ||
      (row?.maxPurchaseLimit != null && Number(row.maxPurchaseLimit) > 0)
    )
  })

  function patchTicket(patch: Partial<EventFormValues["tickets"][number]>) {
    const current = form.getValues(`tickets.${index}`)
    if (!current) return
    update(index, { ...current, ...patch })
  }

  function writeNet(net: number) {
    const current = form.getValues(`tickets.${index}`)
    if (!current) return
    const next = applyNetProfitToTicket(current, net, resolvedFee, extras)
    update(index, {
      ...current,
      ...next,
      calculationMode: "net_income",
      feeStrategy: "pass_to_customer",
    })
  }

  if (!ticket) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[min(100%,26rem)] bg-background">
        <SheetHeader>
          <SheetTitle>Adicional</SheetTitle>
          <SheetDescription>
            Estacionamiento, consumiciones u otros extras de venta.
            {sold > 0 ? ` ${TIER_HAS_SALES_LOCK_HINT}` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
          <FormField
            control={form.control}
            name={`tickets.${index}.name`}
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel className={STUDIO_LABEL_CLASS}>Nombre</FormLabel>
                <Input
                  {...field}
                  value={field.value ?? ""}
                  placeholder="Estacionamiento, consumición, merchandising"
                  aria-invalid={Boolean(fieldState.error)}
                  className={STUDIO_CONTROL_CLASS}
                />
                <FormMessage>{fieldState.error?.message}</FormMessage>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name={`tickets.${index}.capacity`}
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel className={STUDIO_LABEL_CLASS}>
                  Stock del adicional
                </FormLabel>
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
                      patchTicket({ capacity: undefined })
                      return
                    }
                    if (!Number.isNaN(parsed)) {
                      field.onChange(parsed)
                      patchTicket({ capacity: parsed })
                    }
                  }}
                  placeholder="0"
                  className={cn(STUDIO_CONTROL_CLASS, "tabular-nums")}
                />
                <FormMessage>{fieldState.error?.message}</FormMessage>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name={`tickets.${index}.price`}
            render={({ fieldState }) => (
              <FormItem>
                <NetProfitCalculator
                  name={`tickets.${index}.basePrice`}
                  netPrice={resolveTicketNetProfit(ticket, resolvedFee, extras)}
                  onNetChange={writeNet}
                  feePercentage={resolvedFee}
                  fixedFee={fixedFee}
                  isSponsored={isSponsored}
                  invalid={Boolean(fieldState.error)}
                  error={fieldState.error?.message}
                />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name={`tickets.${index}.saleStartsAt`}
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel className={STUDIO_LABEL_CLASS}>
                    Inicio de venta
                  </FormLabel>
                  <Input
                    type="datetime-local"
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    className={STUDIO_CONTROL_CLASS}
                  />
                  <FormDescription className="text-[11px]">
                    Vacío = desde ahora.
                  </FormDescription>
                  <FormMessage>{fieldState.error?.message}</FormMessage>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={`tickets.${index}.saleEndsAt`}
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel className={STUDIO_LABEL_CLASS}>Fin de venta</FormLabel>
                  <Input
                    type="datetime-local"
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    className={STUDIO_CONTROL_CLASS}
                  />
                  <FormDescription className="text-[11px]">
                    Vacío = hasta el evento.
                  </FormDescription>
                  <FormMessage>{fieldState.error?.message}</FormMessage>
                </FormItem>
              )}
            />
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setShowPurchaseRules((value) => !value)}
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
                  name={`tickets.${index}.minPurchaseLimit`}
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
                            patchTicket({ minPurchaseLimit: 1 })
                            return
                          }
                          if (typeof parsed === "number" && !Number.isNaN(parsed)) {
                            const next = Math.max(1, parsed)
                            field.onChange(next)
                            patchTicket({ minPurchaseLimit: next })
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
                  name={`tickets.${index}.maxPurchaseLimit`}
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
                            patchTicket({ maxPurchaseLimit: null })
                            return
                          }
                          if (typeof parsed === "number" && !Number.isNaN(parsed)) {
                            field.onChange(parsed)
                            patchTicket({ maxPurchaseLimit: parsed })
                          }
                        }}
                        className={cn(STUDIO_CONTROL_CLASS, "tabular-nums")}
                      />
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
