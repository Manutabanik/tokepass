"use client"

import { Copy, Minus, Pause, Play, Plus, Trash2 } from "lucide-react"
import type { ReactNode } from "react"
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
import { ticketDisplayBadge } from "@/lib/inventory/aforo-balance"
import {
  asPositiveInt,
  parseStrictInt,
} from "@/lib/inventory/capacity-budget"
import { inferInventoryTierType } from "@/lib/inventory/unified-inventory"
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
        className="size-11 shrink-0"
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
          "h-11 w-16 px-1 text-center font-semibold tabular-nums",
          overflow && "border-destructive",
        )}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-11 shrink-0"
        onClick={() => onCommit(value + 1)}
        aria-label="Sumar cupo"
      >
        <Plus />
      </Button>
    </div>
  )
}

export function TicketWalletCard({
  form,
  index,
  onDuplicate,
  onRemove,
  capacityLabel = "Cupo / Stock",
  venueRemaining,
  children,
}: {
  form: UseFormReturn<EventFormValues>
  index: number
  onDuplicate: () => void
  onRemove: () => void
  capacityLabel?: string
  venueRemaining?: number
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
        "relative overflow-hidden rounded-[22px] border border-border bg-zinc-950/80 shadow-[0_12px_30px_-18px_rgba(0,0,0,0.65)]",
        paused && "opacity-70",
      )}
    >
      <span
        className={cn("absolute inset-y-0 left-0 w-1.5", accent)}
        aria-hidden="true"
      />
      <span
        className="absolute top-1/2 -left-2 size-4 -translate-y-1/2 rounded-full bg-background"
        aria-hidden="true"
      />
      <span
        className="absolute top-1/2 -right-2 size-4 -translate-y-1/2 rounded-full bg-background"
        aria-hidden="true"
      />

      <div className="space-y-4 p-4 pl-5">
        <div className="flex items-start justify-between gap-3">
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.14em] text-zinc-300 uppercase">
            {badge.label}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDuplicate}
              className="text-base md:text-sm"
            >
              <Copy />
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
              className="text-base md:text-sm"
            >
              {paused ? <Play /> : <Pause />}
              {paused ? "Activar" : "Pausar"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onRemove}
              className="size-11 text-muted-foreground hover:text-destructive"
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
            <FormItem>
              <FormLabel className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                Nombre del pase
              </FormLabel>
              <Input
                {...field}
                placeholder="Early Bird, Entrada General, Pase VIP"
                className="h-11 border-0 bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
              />
              <FormMessage>{fieldState.error?.message}</FormMessage>
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name={`tickets.${index}.price`}
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                  Precio ($)
                </FormLabel>
                <PriceInput
                  name={`tickets.${index}.price`}
                  aria-invalid={Boolean(fieldState.error)}
                  value={field.value}
                  onValueChange={(value) => field.onChange(value ?? undefined)}
                  placeholder="0"
                  allowEmpty
                  className="h-11 font-semibold tabular-nums"
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
                <FormLabel className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
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
                      field.onChange(undefined)
                      return
                    }
                    if (typeof parsed === "number" && Number.isNaN(parsed)) {
                      return
                    }
                    field.onChange(parsed)
                  }}
                  onCommit={(next) => field.onChange(next)}
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

        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name={`tickets.${index}.minPurchaseLimit`}
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                  Min por usuario
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
                  className="h-11 text-base tabular-nums md:text-sm"
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
                <FormLabel className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                  Max por usuario
                </FormLabel>
                <Input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Sin limite"
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
                  className="h-11 text-base tabular-nums md:text-sm"
                />
                <FormMessage>{fieldState.error?.message}</FormMessage>
              </FormItem>
            )}
          />
        </div>

        {children}
      </div>
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
      className="h-12 w-full bg-gradient-to-r from-emerald-500 to-cyan-500 text-base font-semibold text-zinc-950 hover:from-emerald-400 hover:to-cyan-400 md:text-sm"
    >
      <Plus className="size-5" />
      {label}
    </Button>
  )
}
