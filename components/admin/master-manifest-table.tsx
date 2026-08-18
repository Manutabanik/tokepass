"use client"

import { Check, Lock, MapPin, Ticket } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatNumber } from "@/lib/format"
import type { EventCapacitySnapshot } from "@/lib/inventory/capacity-budget"
import type { MasterManifestRow } from "@/lib/inventory/master-manifest"
import { cn } from "@/lib/utils"

export function MasterManifestTable({
  rows,
  capacity,
}: {
  rows: MasterManifestRow[]
  capacity: EventCapacitySnapshot
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">
          Master Manifest
        </h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Inventario estructural del mapa y entradas comerciales. Cada fuente
          suma al aforo por su cuenta: no hace falta inflar un sector para
          crear una general.
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tipo / Origen</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead className="text-right">Capacidad</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={4}
                className="py-8 text-center text-sm text-muted-foreground"
              >
                Todavía no hay inventario. Dibujá el mapa o creá una entrada
                general.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id} className="hover:bg-transparent">
                <TableCell>
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
                    {row.origin === "map" ? (
                      <MapPin
                        className="size-3.5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    ) : (
                      <Ticket
                        className="size-3.5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    )}
                    {row.originLabel}
                  </span>
                </TableCell>
                <TableCell className="font-medium text-foreground">
                  {row.name}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(row.capacity)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={row.status === "synced" ? "outline" : "secondary"}
                    className={cn(
                      "gap-1",
                      row.status === "synced"
                        ? "border-border text-muted-foreground"
                        : "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
                    )}
                  >
                    {row.status === "synced" ? (
                      <Lock className="size-3" aria-hidden="true" />
                    ) : (
                      <Check className="size-3" aria-hidden="true" />
                    )}
                    {row.statusLabel}
                  </Badge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
        {capacity.totalCapacity > 0 ? (
          <TableFooter>
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={2} className="text-xs text-muted-foreground">
                Aforo total · mapa {formatNumber(capacity.mapAllocatedCapacity)}{" "}
                + sectores {formatNumber(capacity.generalSectorCapacity)} +
                entradas libres {formatNumber(capacity.unboundGeneralCapacity)}
              </TableCell>
              <TableCell className="text-right text-sm font-semibold tabular-nums">
                {formatNumber(capacity.totalCapacity)}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        ) : null}
      </Table>
    </section>
  )
}
