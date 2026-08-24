"use client"

import { Car, Lock, MoreHorizontal, Pencil, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatCurrency, formatNumber } from "@/lib/format"
import { asPositiveInt } from "@/lib/inventory/capacity-budget"
import { TIER_HAS_SALES_LOCK_HINT } from "@/lib/inventory/synced-day-tickets"
import type { EventFormValues } from "@/lib/validations/event-form"

export function ExtraSummaryRow({
  ticket,
  index,
  onEdit,
  onRemove,
}: {
  ticket: EventFormValues["tickets"][number]
  index: number
  onEdit: () => void
  onRemove?: () => void
}) {
  const sold = Math.max(0, Math.floor(Number(ticket.sold) || 0))
  const lockedBySales = sold > 0
  const name = ticket.name?.trim() || `Adicional ${index + 1}`
  const stock = asPositiveInt(ticket.capacity)
  const price = Number(ticket.price) || 0

  return (
    <article className="flex min-h-12 items-center gap-3 rounded-xl border border-border/70 bg-card/60 px-3 py-2">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <Car className="size-3.5" aria-hidden="true" />
      </span>
      <button
        type="button"
        onClick={onEdit}
        className="min-w-0 flex-1 text-left"
      >
        <p className="truncate text-sm font-medium text-foreground">{name}</p>
        <p className="flex flex-wrap items-center gap-x-1.5 truncate text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            {lockedBySales ? (
              <Lock className="h-3 w-3 text-zinc-400" aria-hidden="true" />
            ) : null}
            Stock: {formatNumber(stock)}
          </span>
          <span className="text-border">·</span>
          <span>Precio: {formatCurrency(price)}</span>
        </p>
        {lockedBySales ? (
          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
            {TIER_HAS_SALES_LOCK_HINT}
          </p>
        ) : null}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Opciones de ${name}`}
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-muted-foreground"
            />
          }
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="size-4 text-muted-foreground" aria-hidden="true" />
            Editar
          </DropdownMenuItem>
          {onRemove ? (
            <DropdownMenuItem
              disabled={lockedBySales}
              title={lockedBySales ? TIER_HAS_SALES_LOCK_HINT : undefined}
              onClick={lockedBySales ? undefined : onRemove}
            >
              {lockedBySales ? (
                <Lock className="size-4 text-zinc-400" aria-hidden="true" />
              ) : (
                <Trash2 className="size-4 text-muted-foreground" aria-hidden="true" />
              )}
              Eliminar
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </article>
  )
}
