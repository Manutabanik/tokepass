"use client"

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

export function ExtraSheet({
  form,
  update,
  open,
  onOpenChange,
  index,
}: {
  form: UseFormReturn<EventFormValues>
  update: UseFieldArrayUpdate<EventFormValues, "tickets">
  open: boolean
  onOpenChange: (open: boolean) => void
  index: number
}) {
  const ticket = form.watch(`tickets.${index}`)
  const feePercentage = clampServiceFeePercentage(
    form.watch("serviceFeePercentage"),
  )
  const sold = ticketSoldCount(ticket)

  function patchTicket(patch: Partial<EventFormValues["tickets"][number]>) {
    const current = form.getValues(`tickets.${index}`)
    if (!current) return
    update(index, { ...current, ...patch })
  }

  function writeNet(net: number) {
    const current = form.getValues(`tickets.${index}`)
    if (!current) return
    const next = applyNetProfitToTicket(current, net, feePercentage)
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
      <SheetContent
        side="right"
        className="w-[min(100%,26rem)] bg-background"
      >
        <SheetHeader>
          <SheetTitle>Adicional</SheetTitle>
          <SheetDescription>
            Estacionamiento, consumiciones u otros extras. No consumen aforo del
            recinto.
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
                  placeholder="Estacionamiento, consumición, merch"
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
                  netPrice={resolveTicketNetProfit(ticket, feePercentage)}
                  onNetChange={writeNet}
                  feePercentage={feePercentage}
                  invalid={Boolean(fieldState.error)}
                  error={fieldState.error?.message}
                />
              </FormItem>
            )}
          />

          <div className="grid gap-3 sm:grid-cols-2">
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
                  <FormLabel className={STUDIO_LABEL_CLASS}>
                    Fin de venta
                  </FormLabel>
                  <Input
                    type="datetime-local"
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    className={STUDIO_CONTROL_CLASS}
                  />
                  <FormDescription className="text-[11px]">
                    Vacío = hasta la fecha del evento.
                  </FormDescription>
                  <FormMessage>{fieldState.error?.message}</FormMessage>
                </FormItem>
              )}
            />
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

export function isBlankExtraTicket(
  ticket: EventFormValues["tickets"][number] | null | undefined,
): boolean {
  if (!ticket) return true
  const unnamed = !(ticket.name ?? "").trim()
  const noStock = !(Number(ticket.capacity) > 0)
  const noPrice = !(Number(ticket.price) > 0)
  return unnamed && noStock && noPrice
}
