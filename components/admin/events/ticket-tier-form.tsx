"use client"

import { Copy, Minus, Pause, Play, Plus, Trash2 } from "lucide-react"
import type { ReactNode } from "react"
import type { UseFormReturn } from "react-hook-form"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { PriceInput } from "@/components/ui/price-input"
import { formatCurrency } from "@/lib/format"
import { ticketDisplayBadge } from "@/lib/inventory/aforo-balance"
import {
  asPositiveInt,
  parseStrictInt,
} from "@/lib/inventory/capacity-budget"
import { inferInventoryTierType } from "@/lib/inventory/unified-inventory"
import {
  calculateTierPricing,
  type TicketCalculationMode,
  type TicketFeeStrategy,
} from "@/lib/pricing/flexible-pricing"
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

function TierPricingSimulator({
  form,
  index,
  feePercentage,
  fixedFee,
  isSponsored,
  showPrice = true,
  showAdvanced = true,
}: {
  form: UseFormReturn<EventFormValues>
  index: number
  feePercentage: number
  fixedFee: number
  isSponsored: boolean
  showPrice?: boolean
  showAdvanced?: boolean
}) {
  const price = form.watch(`tickets.${index}.price`)
  const basePrice = form.watch(`tickets.${index}.basePrice`)
  const feeStrategy =
    form.watch(`tickets.${index}.feeStrategy`) ?? "absorb_in_price"
  const calculationMode =
    form.watch(`tickets.${index}.calculationMode`) ?? "public_price"

  const inputValue =
    calculationMode === "net_income"
      ? Number(basePrice ?? price) || 0
      : Number(price) || 0

  const calculation = calculateTierPricing({
    inputValue,
    feePercentage,
    fixedFee,
    feeStrategy,
    calculationMode,
    sponsored: isSponsored,
  })

  function applyCalculation(
    nextStrategy: TicketFeeStrategy,
    nextMode: TicketCalculationMode,
    nextInput: number | undefined,
  ) {
    const calc = calculateTierPricing({
      inputValue: nextInput ?? 0,
      feePercentage,
      fixedFee,
      feeStrategy: nextStrategy,
      calculationMode: nextMode,
      sponsored: isSponsored,
    })
    form.setValue(`tickets.${index}.feeStrategy`, nextStrategy, {
      shouldDirty: true,
    })
    form.setValue(`tickets.${index}.calculationMode`, nextMode, {
      shouldDirty: true,
    })
    form.setValue(`tickets.${index}.price`, calc.publicPrice, {
      shouldDirty: true,
      shouldValidate: true,
    })
    form.setValue(`tickets.${index}.basePrice`, calc.organizerNet, {
      shouldDirty: true,
    })
  }

  return (
    <div className="flex flex-col gap-y-4">
      {showPrice ? (
        <>
      <FormField
        control={form.control}
        name={
          calculationMode === "net_income"
            ? `tickets.${index}.basePrice`
            : `tickets.${index}.price`
        }
        render={({ field, fieldState }) => (
          <FormItem className="flex flex-col gap-y-2">
            <FormLabel className="mb-1.5 text-sm font-semibold text-foreground/90">
              {calculationMode === "net_income"
                ? "Lo que te queda a vos por entrada"
                : "Precio por entrada ($)"}
            </FormLabel>
            <PriceInput
              name={field.name}
              aria-invalid={Boolean(fieldState.error)}
              value={field.value}
              onValueChange={(value) => {
                applyCalculation(feeStrategy, calculationMode, value)
              }}
              placeholder="0"
              allowEmpty
              className="h-12 rounded-xl border-border/60 bg-muted/20 px-4 font-semibold tabular-nums transition-all focus:bg-background sm:h-13"
            />
            <FormMessage>{fieldState.error?.message}</FormMessage>
          </FormItem>
        )}
      />
      {calculationMode === "net_income" ? (
        <FormField
          control={form.control}
          name={`tickets.${index}.price`}
          render={({ fieldState }) => (
            <FormMessage>{fieldState.error?.message}</FormMessage>
          )}
        />
      ) : null}
        </>
      ) : null}

      {showAdvanced ? (
        <div className="flex flex-col gap-y-4">
            <div className="flex flex-col gap-y-2">
              <p className="mb-1.5 text-sm font-semibold text-foreground/90">
                Comisión TokePass ({isSponsored ? 0 : feePercentage}%)
              </p>
              <Tabs
                value={feeStrategy}
                onValueChange={(value) => {
                  if (
                    value !== "pass_to_customer" &&
                    value !== "absorb_in_price"
                  ) {
                    return
                  }
                  applyCalculation(
                    value,
                    calculationMode,
                    calculationMode === "net_income"
                      ? calculation.organizerNet
                      : calculation.publicPrice,
                  )
                }}
              >
                <TabsList className="grid h-12 w-full grid-cols-2 rounded-xl">
                  <TabsTrigger
                    value="pass_to_customer"
                    title="El cliente paga el precio + el costo de servicio"
                  >
                    Recargar la comisión al comprador
                  </TabsTrigger>
                  <TabsTrigger
                    value="absorb_in_price"
                    title="Se descuenta de tu precio de venta, el cliente ve un número redondo"
                  >
                    Hacerte cargo de la comisión
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <Tabs
              value={calculationMode}
              onValueChange={(value) => {
                if (value !== "net_income" && value !== "public_price") return
                applyCalculation(
                  feeStrategy,
                  value,
                  value === "net_income"
                    ? calculation.organizerNet
                    : calculation.publicPrice,
                )
              }}
            >
              <TabsList className="grid h-12 w-full grid-cols-2 rounded-xl">
                <TabsTrigger value="public_price">Precio público</TabsTrigger>
                <TabsTrigger value="net_income">Quiero ganar</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex flex-col gap-y-2 rounded-2xl bg-muted/30 p-4 text-xs">
              <div className="flex items-center justify-between gap-3 text-muted-foreground">
                <span className="min-w-0">Lo que te queda a vos por entrada</span>
                <span className="shrink-0 font-bold text-foreground tabular-nums">
                  {formatCurrency(calculation.organizerNet)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 text-muted-foreground">
                <span className="min-w-0">
                  Comisión ({isSponsored ? 0 : feePercentage}%
                  {fixedFee > 0 && !isSponsored
                    ? ` + ${formatCurrency(fixedFee)}`
                    : ""}
                  )
                </span>
                <span className="shrink-0 font-semibold text-foreground tabular-nums">
                  {formatCurrency(calculation.serviceFee)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-border/50 pt-2 text-sm font-bold text-foreground">
                <span className="min-w-0">Precio final</span>
                <span className="shrink-0 tabular-nums">
                  {formatCurrency(calculation.publicPrice)}
                </span>
              </div>
            </div>
        </div>
      ) : null}
    </div>
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

  return (
    <article
      className={cn(
        "flex flex-col gap-y-5 rounded-2xl bg-card p-6",
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
            className="size-11 shrink-0 text-muted-foreground hover:text-destructive"
            aria-label="Eliminar tarifa"
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      <FormField
        control={form.control}
        name={`tickets.${index}.name`}
        render={({ field, fieldState }) => (
          <FormItem className="flex flex-col gap-y-2">
            <FormLabel className="mb-1.5 text-sm font-semibold text-foreground/90">
              Nombre del pase
            </FormLabel>
            <Input
              {...field}
              placeholder="Early Bird, Entrada General, Pase VIP"
              className="h-12 rounded-xl border-border/60 bg-muted/20 px-4 text-lg font-semibold transition-all focus:bg-background sm:h-13"
            />
            <FormMessage>{fieldState.error?.message}</FormMessage>
          </FormItem>
        )}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TierPricingSimulator
          form={form}
          index={index}
          feePercentage={feePercentage}
          fixedFee={fixedFee}
          isSponsored={isSponsored}
          showAdvanced={false}
        />
        <FormField
          control={form.control}
          name={`tickets.${index}.capacity`}
          render={({ field, fieldState }) => (
            <FormItem className="flex flex-col gap-y-2">
              <FormLabel className="mb-1.5 text-sm font-semibold text-foreground/90">
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          control={form.control}
          name={`tickets.${index}.saleStartsAt`}
          render={({ field, fieldState }) => (
            <FormItem className="flex flex-col gap-y-2">
              <FormLabel className="mb-1.5 text-sm font-semibold text-foreground/90">
                Inicio de venta
              </FormLabel>
              <Input
                type="datetime-local"
                value={field.value ?? ""}
                onChange={field.onChange}
                className="h-12 rounded-xl border-border/60 bg-muted/20 px-4 text-base transition-all focus:bg-background sm:h-13"
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
              <FormLabel className="mb-1.5 text-sm font-semibold text-foreground/90">
                Fin de venta
              </FormLabel>
              <Input
                type="datetime-local"
                value={field.value ?? ""}
                onChange={field.onChange}
                className="h-12 rounded-xl border-border/60 bg-muted/20 px-4 text-base transition-all focus:bg-background sm:h-13"
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
            Configuraciones adicionales de venta
          </AccordionTrigger>
          <AccordionContent className="flex flex-col gap-y-4 pb-4">
            <TierPricingSimulator
              form={form}
              index={index}
              feePercentage={feePercentage}
              fixedFee={fixedFee}
              isSponsored={isSponsored}
              showPrice={false}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name={`tickets.${index}.minPurchaseLimit`}
                render={({ field, fieldState }) => (
                  <FormItem className="flex min-w-0 flex-col gap-y-2">
                    <FormLabel className="mb-1.5 text-sm font-semibold text-foreground/90">
                      Límite de entradas por persona
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
                      className="h-12 rounded-xl border-border/60 bg-muted/20 px-4 text-base tabular-nums transition-all focus:bg-background sm:h-13"
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
                    <FormLabel className="mb-1.5 text-sm font-semibold text-foreground/90">
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
                      className="h-12 rounded-xl border-border/60 bg-muted/20 px-4 text-base tabular-nums transition-all focus:bg-background sm:h-13"
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
