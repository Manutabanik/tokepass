"use client"

import { IdCard, Phone, ShoppingBag, UserRound } from "lucide-react"
import { useEffect, useState, useTransition } from "react"

import {
  getBuyerPurchaseHistory,
  type BuyerOrderRow,
  type BuyerRow,
} from "@/app/actions/organizer-kyb"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format"

const STATUS_LABEL: Record<string, string> = {
  paid: "Pagada",
  pending: "Pendiente",
  failed: "Fallida",
  expired: "Vencida",
  refunded: "Reembolsada",
  refund_processing: "Devolución en proceso",
}

export function BuyersPanel({ buyers }: { buyers: BuyerRow[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<{
    buyer: BuyerRow
    orders: BuyerOrderRow[]
  } | null>(null)
  const [pending, startTransition] = useTransition()
  if (!selectedId && detail) {
    setDetail(null)
  }

  useEffect(() => {
    if (!selectedId) return
    startTransition(async () => {
      const result = await getBuyerPurchaseHistory(selectedId)
      if (!result.buyer) {
        setDetail(null)
        return
      }
      setDetail({ buyer: result.buyer, orders: result.orders })
    })
  }, [selectedId])

  if (buyers.length === 0) {
    return (
      <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground">
        No hay compradores todavía.
      </div>
    )
  }

  return (
    <>
      {/* Mobile cards */}
      <div className="grid gap-3 md:hidden">
        {buyers.map((buyer) => (
          <article
            key={buyer.id}
            className="rounded-2xl border border-border bg-card p-4 text-card-foreground"
          >
            <p className="text-lg font-bold text-foreground">{buyer.name}</p>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {buyer.email}
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <IdCard className="size-3.5" />
                {buyer.dni ?? "Sin DNI"}
              </span>
              <span className="inline-flex items-center gap-1">
                <Phone className="size-3.5" />
                {buyer.phone ?? "Sin teléfono"}
              </span>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-2xl font-black tabular-nums text-sky-700 dark:text-sky-300">
                  {buyer.ordersCount}
                </p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  compras · {formatDate(buyer.joinedAt)}
                </p>
              </div>
              <Button
                type="button"
                className="min-h-12 rounded-xl bg-sky-600 px-4 font-bold text-white hover:bg-sky-500"
                onClick={() => setSelectedId(buyer.id)}
              >
                Ver ficha
              </Button>
            </div>
          </article>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-5 py-3 font-medium">Comprador</th>
              <th className="px-5 py-3 font-medium">DNI</th>
              <th className="px-5 py-3 font-medium">Teléfono</th>
              <th className="px-5 py-3 font-medium">Compras</th>
              <th className="px-5 py-3 font-medium">Alta</th>
              <th className="px-5 py-3 text-right font-medium">Ficha</th>
            </tr>
          </thead>
          <tbody>
            {buyers.map((buyer) => (
              <tr
                key={buyer.id}
                className="border-b border-border hover:bg-muted/50"
              >
                <td className="px-5 py-4">
                  <p className="font-medium text-foreground">{buyer.name}</p>
                  <p className="text-xs text-muted-foreground">{buyer.email}</p>
                </td>
                <td className="px-5 py-4 font-mono text-xs text-muted-foreground">
                  {buyer.dni ?? "—"}
                </td>
                <td className="px-5 py-4 text-muted-foreground">
                  {buyer.phone ?? "—"}
                </td>
                <td className="px-5 py-4 text-foreground">{buyer.ordersCount}</td>
                <td className="px-5 py-4 text-muted-foreground">
                  {formatDate(buyer.joinedAt)}
                </td>
                <td className="px-5 py-4 text-right">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-11 border-border bg-transparent"
                    onClick={() => setSelectedId(buyer.id)}
                  >
                    Ver ficha
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Sheet
        open={Boolean(selectedId)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null)
        }}
      >
        <SheetContent
          side="bottom"
          className="max-h-[92dvh] gap-0 overflow-y-auto border-border bg-card p-0 text-card-foreground sm:inset-y-0 sm:left-auto sm:right-0 sm:h-full sm:max-h-none sm:w-full sm:max-w-lg sm:rounded-none sm:border-l sm:border-t-0"
        >
          <SheetHeader className="border-b border-border px-5 py-4 text-left">
            <SheetTitle className="flex items-center gap-2 text-foreground">
              <UserRound className="size-5 text-sky-600 dark:text-sky-300" />
              Ficha 360
            </SheetTitle>
            <SheetDescription className="text-muted-foreground">
              Datos del comprador e historial de compras.
            </SheetDescription>
          </SheetHeader>

          <div className="px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5">
            {pending && !detail ? (
              <p className="text-sm text-muted-foreground">Cargando…</p>
            ) : detail ? (
              <div className="space-y-5">
                <div className="rounded-2xl border border-border bg-muted/50 p-4">
                  <p className="text-xl font-bold text-foreground">
                    {detail.buyer.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {detail.buyer.email}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <IdCard className="size-4" />
                      {detail.buyer.dni ?? "Sin DNI"}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Phone className="size-4" />
                      {detail.buyer.phone ?? "Sin teléfono"}
                    </span>
                  </div>
                </div>

                <div>
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <ShoppingBag className="size-3.5" />
                    Historial de compras
                  </p>
                  {detail.orders.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Sin compras todavía.
                    </p>
                  ) : (
                    <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
                      {detail.orders.map((order) => (
                        <article
                          key={order.id}
                          className="rounded-xl border border-border bg-background px-3 py-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-foreground">
                                {order.eventTitle}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {formatDateTime(order.createdAt)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-mono text-base font-bold text-emerald-700 dark:text-emerald-300">
                                {formatCurrency(order.totalAmount)}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {STATUS_LABEL[order.status] ?? order.status}
                              </p>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
