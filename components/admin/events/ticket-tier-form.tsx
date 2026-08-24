"use client"

import { Copy, Lock, Minus, Pause, Play, Plus, Trash2 } from "lucide-react"
import type { ReactNode } from "react"
import type { UseFormReturn } from "react-hook-form"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import {
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { ticketDisplayBadge } from "@/lib/inventory/aforo-balance"
import {
  asPositiveInt,
  parseStrictInt,
} from "@/lib/inventory/capacity-budget"
import { inferInventoryTierType } from "@/lib/inventory/unified-inventory"
import {
  ticketSoldCount,
  TIER_HAS_SALES_LOCK_HINT,
} from "@/lib/inventory/synced-day-tickets"
import { NetProfitCalculator } from "@/components/admin/events/net-profit-calculator"
import {
  applyNetProfitToTicket,
  resolveTicketNetProfit,
} from "@/lib/pricing/net-profit"
import {
  STUDIO_CONTROL_CLASS,
  STUDIO_LABEL_CLASS,
} from "@/lib/admin/studio-form-styles"
import type { EventFormValues } from "@/lib/validations/event-form"
import { cn } from "@/lib/utils"

export function ticketWalletAccent(tier: {
  name?: string
  price?: number | null
  tierType?: string | null
  layoutType?: string | null
  bundleItems?: unknown
}) {
  const type = inferInventoryTierType({
    tierType: tier.tierType,
    layoutType: tier.layoutType,
    bundleItems: Array.isArray(tier.bundleItems) ? tier.bundleItems : [],
  })
  const badge = ticketDisplayBadge({
    name: tier.name,
    price: tier.price,
    tierType: type,
    bundleItems: Array.isArray(tier.bundleItems) ? tier.bundleItems : [],
  }).label
  if (badge === "VIP") return "bg-violet-500"
  if (type === "bundle") return "bg-fuchsia-500"
  if (type === "addon") return "bg-amber-500"
  if (type === "seated") return "bg-cyan-500"
  if (badge === "Cortesía") return "bg-zinc-400"
  return "bg-emerald-500"
}

function StockStepper({
  value,
  display,
  overflow,
  onDisplayChange,
  onCommit,
}: {
  value: number
  display: string
  overflow?: boolean
  onDisplayChange: (raw: string) => void
  onCommit: (next: number | undefined) => void
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-12 shrink-0 rounded-xl"
        onClick={() => onCommit(Math.max(0, value - 1) || undefined)}
        aria-label="Quitar cupo"
      >
        <Minus />
      </Button>
      <Input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={display}
        onChange={(event) => onDisplayChange(event.target.value)}
        placeholder="0"
        className={cn(
          "h-12 w-16 rounded-xl px-1 text-center font-semibold tabular-nums sm:h-13",
          overflow && "border-destructive",
        )}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-12 shrink-0 rounded-xl"
        onClick={() => onCommit(value + 1)}
        aria-label="Sumar cupo"
      >
        <Plus />
      </Button>
    </div>
  )
}

function TierNetCalculator({
  form,
  index,
  feePercentage,
  fixedFee,
  isSponsored,
}: {
  form: UseFormReturn<EventFormValues>
  index: number
  feePercentage: number
  fixedFee: number
  isSponsored: boolean
}) {
  const ticket = form.watch(`tickets.${index}`)
  const extras = { fixedFee, sponsored: isSponsored }

  function writeNet(net: number) {
    const current = form.getValues(`tickets.${index}`)
    if (!current) return
    const next = applyNetProfitToTicket(current, net, feePercentage, extras)
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
  }

  return (
    <FormField
      control={form.control}
      name={`tickets.${index}.price`}
      render={({ fieldState }) => (
        <FormItem>
          <NetProfitCalculator
            name={`tickets.${index}.basePrice`}
            netPrice={resolveTicketNetProfit(ticket ?? {}, feePercentage, extras)}
            onNetChange={writeNet}
            feePercentage={feePercentage}
            fixedFee={fixedFee}
            isSponsored={isSponsored}
            invalid={Boolean(fieldState.error)}
            error={fieldState.error?.message}
          />
        </FormItem>
      )}
    />
  )
}

export function TicketWalletCard({
  form,
  index,
  onDuplicate,
  onRemove,
  capacityLabel = "¿Cuántas entradas ponés a la venta?",
  venueRemaining,
  feePercentage = 15,
  fixedFee = 0,
  isSponsored = false,
  children,
}: {
  form: UseFormReturn<EventFormValues>
  index: number
  onDuplicate: () => void
  onRemove: () => void
  capacityLabel?: string
  venueRemaining?: number
  feePercentage?: number
  fixedFee?: number
  isSponsored?: boolean
  children?: ReactNode
}) {
  const name = form.watch(`tickets.${index}.name`)
  const price = form.watch(`tickets.${index}.price`)
  const capacity = form.watch(`tickets.${index}.capacity`)
  const visibility = form.watch(`tickets.${index}.visibility`)
  const tierType = form.watch(`tickets.${index}.tierType`)
  const layoutType = form.watch(`tickets.${index}.layoutType`)
  const bundleItems = form.watch(`tickets.${index}.bundleItems`)
  const paused = visibility === "private"
  const badge = ticketDisplayBadge({
    name,
    price,
    tierType: inferInventoryTierType({
      tierType,
      layoutType,
      bundleItems,
    }),
    bundleItems,
  })
  const accent = ticketWalletAccent({
    name,
    price,
    tierType,
    layoutType,
    bundleItems,
  })
  const stock = asPositiveInt(capacity)
  const overflow = venueRemaining != null && stock > venueRemaining
  const sold = ticketSoldCount({
    sold: form.watch(`tickets.${index}.sold`),
  })
  const lockedBySales = sold > 0

  return (
    <article
      className={cn(
        "flex min-w-0 flex-col gap-y-5 overflow-x-hidden rounded-2xl bg-card p-6",
        paused && "opacity-70",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span
          className={cn(
            "inline-flex items-center gap-2 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground",
          )}
        >
          <span className={cn("size-1.5 shrink-0 rounded-full", accent)} />
          {badge.label}
        </span>
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDuplicate}
            className="text-sm"
          >
            <Copy className="shrink-0" />
            Duplicar
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              form.setValue(
                `tickets.${index}.visibility`,
                paused ? "public" : "private",
                { shouldDirty: true },
              )
            }
            className="text-sm"
          >
            {paused ? <Play className="shrink-0" /> : <Pause className="shrink-0" />}
            {paused ? "Activar" : "Pausar"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            disabled={lockedBySales}
            className="size-11 shrink-0 text-muted-foreground hover:text-destructive"
            aria-label={
              lockedBySales ? TIER_HAS_SALES_LOCK_HINT : "Eliminar tarifa"
            }
            title={lockedBySales ? TIER_HAS_SALES_LOCK_HINT : undefined}
          >
            {lockedBySales ? (
              <Lock className="h-3 w-3 text-zinc-400" aria-hidden="true" />
            ) : (
              <Trash2 />
            )}
          </Button>
        </div>
      </div>
      {lockedBySales ? (
        <p className="text-[11px] leading-4 text-muted-foreground">
          {TIER_HAS_SALES_LOCK_HINT}
        </p>
      ) : null}

      <FormField
        control={form.control}
        name={`tickets.${index}.name`}
        render={({ field, fieldState }) => (
          <FormItem className="flex flex-col gap-y-2">
            <FormLabel className={STUDIO_LABEL_CLASS}>
              Nombre del pase
            </FormLabel>
            <Input
              {...field}
              placeholder="Early Bird, Entrada General, Pase VIP"
              className={cn(STUDIO_CONTROL_CLASS, "text-lg font-semibold")}
            />
            <FormMessage>{fieldState.error?.message}</FormMessage>
          </FormItem>
        )}
      />

      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <TierNetCalculator
            form={form}
            index={index}
            feePercentage={feePercentage}
            fixedFee={fixedFee}
            isSponsored={isSponsored}
          />
        </div>
        <FormField
          control={form.control}
          name={`tickets.${index}.capacity`}
          render={({ field, fieldState }) => (
            <FormItem className="flex flex-col gap-y-2">
              <FormLabel className={STUDIO_LABEL_CLASS}>
                {capacityLabel}
              </FormLabel>
              <StockStepper
                value={stock}
                overflow={overflow}
                display={
                  field.value == null || Number.isNaN(Number(field.value))
                    ? ""
                    : String(field.value)
                }
                onDisplayChange={(raw) => {
                  const parsed = parseStrictInt(raw)
                  if (parsed === "") {
                    form.setValue(`tickets.${index}.capacity`, undefined as unknown as number, {
                      shouldDirty: true,
                      shouldTouch: true,
                    })
                    field.onChange(undefined)
                    return
                  }
                  if (typeof parsed === "number" && Number.isNaN(parsed)) {
                    return
                  }
                  form.setValue(`tickets.${index}.capacity`, parsed, {
                    shouldDirty: true,
                    shouldTouch: true,
                  })
                  field.onChange(parsed)
                }}
                onCommit={(next) => {
                  form.setValue(
                    `tickets.${index}.capacity`,
                    next as EventFormValues["tickets"][number]["capacity"],
                    { shouldDirty: true, shouldTouch: true },
                  )
                  field.onChange(next)
                }}
              />
              {overflow ? (
                <p className="text-xs text-destructive" role="alert">
                  El stock supera la capacidad disponible.
                </p>
              ) : null}
              <FormMessage>{fieldState.error?.message}</FormMessage>
            </FormItem>
          )}
        />
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          control={form.control}
          name={`tickets.${index}.saleStartsAt`}
          render={({ field, fieldState }) => (
            <FormItem className="flex flex-col gap-y-2">
              <FormLabel className={STUDIO_LABEL_CLASS}>
                Inicio de venta
              </FormLabel>
              <Input
                type="datetime-local"
                value={field.value ?? ""}
                onChange={field.onChange}
                className={STUDIO_CONTROL_CLASS}
              />
              <FormDescription>
                Dejá vacío para vender desde ahora.
              </FormDescription>
              <FormMessage>{fieldState.error?.message}</FormMessage>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`tickets.${index}.saleEndsAt`}
          render={({ field, fieldState }) => (
            <FormItem className="flex flex-col gap-y-2">
              <FormLabel className={STUDIO_LABEL_CLASS}>
                Fin de venta
              </FormLabel>
              <Input
                type="datetime-local"
                value={field.value ?? ""}
                onChange={field.onChange}
                className={STUDIO_CONTROL_CLASS}
              />
              <FormDescription>
                Dejá vacío para vender hasta la fecha del evento.
              </FormDescription>
              <FormMessage>{fieldState.error?.message}</FormMessage>
            </FormItem>
          )}
        />
      </div>

      <Accordion className="rounded-2xl bg-muted/20 px-4">
        <AccordionItem value={`limits-${index}`} className="border-0">
          <AccordionTrigger className="py-3 text-sm text-foreground hover:no-underline">
            Reglas de compra
          </AccordionTrigger>
          <AccordionContent className="flex flex-col gap-y-4 pb-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name={`tickets.${index}.minPurchaseLimit`}
                render={({ field, fieldState }) => (
                  <FormItem className="flex min-w-0 flex-col gap-y-2">
                    <FormLabel className={STUDIO_LABEL_CLASS}>
                      Mínimo por compra
                    </FormLabel>
                    <Input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={
                        field.value == null || Number.isNaN(Number(field.value))
                          ? "1"
                          : String(field.value)
                      }
                      onChange={(event) => {
                        const parsed = parseStrictInt(event.target.value)
                        if (parsed === "") {
                          field.onChange(1)
                          return
                        }
                        if (typeof parsed === "number" && Number.isNaN(parsed)) {
                          return
                        }
                        field.onChange(
                          typeof parsed === "number" ? Math.max(1, parsed) : 1,
                        )
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
                  <FormItem className="flex min-w-0 flex-col gap-y-2">
                    <FormLabel className={STUDIO_LABEL_CLASS}>
                      Máximo por compra
                    </FormLabel>
                    <Input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="Máximo 4 por compra"
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
                      className={cn(STUDIO_CONTROL_CLASS, "tabular-nums")}
                    />
                    <FormMessage>{fieldState.error?.message}</FormMessage>
                  </FormItem>
                )}
              />
            </div>
            {children}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </article>
  )
}

export function AddTicketTypeButton({
  onClick,
  label = "Agregar Nuevo Tipo de Entrada",
}: {
  onClick: () => void
  label?: string
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      className="h-12 w-full bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90 md:text-sm"
    >
      <Plus className="size-5" />
      {label}
    </Button>
  )
}
