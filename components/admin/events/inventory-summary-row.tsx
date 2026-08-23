"use client"

import { Map, MoreHorizontal, Pencil, Ticket, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatCurrency, formatNumber } from "@/lib/format"
import type { InventoryFamily } from "@/lib/inventory/synced-day-tickets"

export function InventorySummaryRow({
  family,
  onEdit,
  onRemove,
}: {
  family: InventoryFamily
  onEdit: () => void
  onRemove?: () => void
}) {
  const Icon = family.kind === "map" ? Map : Ticket
  return (
    <article className="flex min-h-12 items-center gap-3 rounded-xl border border-border/70 bg-card/60 px-3 py-2">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-3.5" aria-hidden="true" />
      </span>
      <button
        type="button"
        onClick={onEdit}
        className="min-w-0 flex-1 text-left"
      >
        <p className="truncate text-sm font-medium text-foreground">
          {family.name}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          Stock: {formatNumber(family.stock)}
          <span className="mx-1.5 text-border">·</span>
          Precio:{" "}
          {family.priceMixed
            ? `desde ${formatCurrency(family.price)}`
            : formatCurrency(family.price)}
        </p>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Opciones de ${family.name}`}
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
            <DropdownMenuItem onClick={onRemove}>
              <Trash2 className="size-4 text-muted-foreground" aria-hidden="true" />
              Eliminar
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </article>
  )
}
