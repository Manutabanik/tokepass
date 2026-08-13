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
}

export function BuyersPanel({ buyers }: { buyers: BuyerRow[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<{
    buyer: BuyerRow
    orders: BuyerOrderRow[]
  } | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      return
    }
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
      <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-white/10 text-sm text-zinc-500">
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
            className="rounded-2xl border border-white/10 bg-black/30 p-4"
          >
            <p className="text-lg font-bold text-white">{buyer.name}</p>
            <p className="mt-1 truncate text-sm text-zinc-500">{buyer.email}</p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-400">
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
                <p className="text-2xl font-black tabular-nums text-sky-300">
                  {buyer.ordersCount}
                </p>
                <p className="text-[10px] uppercase tracking-wide text-zinc-600">
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
      <div className="hidden overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/8 text-xs uppercase tracking-wide text-zinc-600">
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
                className="border-b border-white/6 hover:bg-white/[0.025]"
              >
                <td className="px-5 py-4">
                  <p className="font-medium text-zinc-100">{buyer.name}</p>
                  <p className="text-xs text-zinc-600">{buyer.email}</p>
                </td>
                <td className="px-5 py-4 font-mono text-xs text-zinc-400">
                  {buyer.dni ?? "—"}
                </td>
                <td className="px-5 py-4 text-zinc-400">{buyer.phone ?? "—"}</td>
                <td className="px-5 py-4 text-zinc-300">{buyer.ordersCount}</td>
                <td className="px-5 py-4 text-zinc-500">
                  {formatDate(buyer.joinedAt)}
                </td>
                <td className="px-5 py-4 text-right">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-11 border-white/15 bg-transparent"
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
          className="max-h-[92dvh] gap-0 overflow-y-auto border-white/10 bg-zinc-950 p-0 text-zinc-100 sm:inset-y-0 sm:left-auto sm:right-0 sm:h-full sm:max-h-none sm:w-full sm:max-w-lg sm:rounded-none sm:border-l sm:border-t-0"
        >
          <SheetHeader className="border-b border-white/8 px-5 py-4 text-left">
            <SheetTitle className="flex items-center gap-2 text-white">
              <UserRound className="size-5 text-sky-300" />
              Ficha 360
            </SheetTitle>
            <SheetDescription className="text-zinc-500">
              Datos del comprador e historial de compras.
            </SheetDescription>
          </SheetHeader>

          <div className="px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5">
            {pending && !detail ? (
              <p className="text-sm text-zinc-500">Cargando…</p>
            ) : detail ? (
              <div className="space-y-5">
                <div className="rounded-2xl border border-white/8 bg-black/30 p-4">
                  <p className="text-xl font-bold text-white">
                    {detail.buyer.name}
                  </p>
                  <p className="text-sm text-zinc-500">{detail.buyer.email}</p>
                  <div className="mt-3 flex flex-wrap gap-3 text-sm text-zinc-400">
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
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                    <ShoppingBag className="size-3.5" />
                    Historial de compras
                  </p>
                  {detail.orders.length === 0 ? (
                    <p className="text-sm text-zinc-500">Sin compras todavía.</p>
                  ) : (
                    <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
                      {detail.orders.map((order) => (
                        <article
                          key={order.id}
                          className="rounded-xl border border-white/8 bg-black/20 px-3 py-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-zinc-200">
                                {order.eventTitle}
                              </p>
                              <p className="mt-1 text-xs text-zinc-600">
                                {formatDateTime(order.createdAt)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-mono text-base font-bold text-emerald-300">
                                {formatCurrency(order.totalAmount)}
                              </p>
                              <p className="text-[11px] text-zinc-500">
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
