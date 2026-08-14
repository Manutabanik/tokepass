"use client"

import {
  LoaderCircle,
  Minus,
  Plus,
  ShoppingBag,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import {
  startStoreCheckout,
  type EventItem,
} from "@/app/actions/addons"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/format"
import { redirectToCheckoutPaymentOrToast } from "@/lib/checkout-redirect"
import {
  EVENT_ITEM_CATEGORY_ICONS,
  EVENT_ITEM_CATEGORY_LABELS,
  type EventItemCategory,
} from "@/lib/store-categories"
import { cn } from "@/lib/utils"

const MAX_QTY = 10

export function EventStoreUpsell({
  eventId,
  eventTitle,
  items,
  canPurchase,
  compact = false,
}: {
  eventId: string
  eventTitle: string
  items: EventItem[]
  canPurchase: boolean
  compact?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries(items.map((item) => [item.id, 0])),
  )

  const selection = useMemo(
    () =>
      items
        .map((item) => ({
          item,
          quantity: qty[item.id] ?? 0,
        }))
        .filter((row) => row.quantity > 0),
    [items, qty],
  )

  const total = selection.reduce(
    (sum, row) => sum + row.item.price * row.quantity,
    0,
  )

  const byCategory = useMemo(() => {
    const map = new Map<EventItemCategory, EventItem[]>()
    for (const item of items) {
      const list = map.get(item.category) ?? []
      list.push(item)
      map.set(item.category, list)
    }
    return map
  }, [items])

  if (items.length === 0) return null

  function setItemQty(itemId: string, next: number, max: number) {
    setQty((current) => ({
      ...current,
      [itemId]: Math.min(Math.max(0, next), max),
    }))
  }

  function handleCheckout() {
    if (!canPurchase) {
      toast.error("Necesitás una entrada de este evento para comprar extras.")
      return
    }
    if (selection.length === 0 || pending) return

    startTransition(async () => {
      const result = await startStoreCheckout(
        eventId,
        selection.map((row) => ({
          itemId: row.item.id,
          quantity: row.quantity,
        })),
      )

      if (!result.success) {
        if (result.error === "auth_required") {
          router.push(`/login?next=/cuenta/entradas`)
          return
        }
        if (result.error === "out_of_stock") {
          toast.error("Stock insuficiente. Actualizá la página.")
          router.refresh()
          return
        }
        toast.error(result.error)
        return
      }

      redirectToCheckoutPaymentOrToast(result.paymentUrl ?? result.initPoint)
    })
  }

  return (
    <section
      className={cn(
        "rounded-3xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950/70",
        compact ? "p-4" : "p-5 sm:p-6",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-violet-500/15 text-violet-600 dark:text-violet-300">
          <ShoppingBag className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-600 dark:text-violet-300">
            Tienda de Extras
          </p>
          <h2 className="mt-1 text-xl font-black tracking-tight text-zinc-900 dark:text-white">
            Potenciá tu experiencia
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            {canPurchase
              ? `Sumá productos de ${eventTitle}. Cada uno tiene su propio QR de canje.`
              : "Disponible cuando tengas una entrada válida de este evento."}
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-6">
        {[...byCategory.entries()].map(([category, categoryItems]) => {
          const Icon = EVENT_ITEM_CATEGORY_ICONS[category]
          return (
            <div key={category} className="space-y-3">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                <Icon className="size-3.5" aria-hidden="true" />
                {EVENT_ITEM_CATEGORY_LABELS[category]}
              </p>
              {categoryItems.map((item) => {
                const quantity = qty[item.id] ?? 0
                const max = Math.min(MAX_QTY, item.stock)
                const soldOut = max <= 0
                return (
                  <article
                    key={item.id}
                    className={cn(
                      "flex gap-3 rounded-2xl border px-3 py-3",
                      quantity > 0
                        ? "border-violet-500/40 bg-violet-500/5"
                        : "border-zinc-200 dark:border-zinc-800",
                      soldOut && "opacity-60",
                    )}
                  >
                    <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-900">
                      {item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="size-full object-cover"
                        />
                      ) : (
                        <span className="grid size-full place-items-center text-zinc-400">
                          <Icon className="size-5" aria-hidden="true" />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-zinc-900 dark:text-white">
                            {item.name}
                          </p>
                          {item.description ? (
                            <p className="mt-0.5 text-xs text-zinc-500">
                              {item.description}
                            </p>
                          ) : null}
                          <p className="mt-1 text-xs text-zinc-500">
                            {soldOut ? "Agotado" : `${item.stock} disponibles`}
                          </p>
                        </div>
                        <p className="shrink-0 font-bold tabular-nums text-zinc-900 dark:text-white">
                          {formatCurrency(item.price)}
                        </p>
                      </div>
                      <div className="mt-3 flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="outline"
                          disabled={soldOut || quantity <= 0 || pending}
                          onClick={() =>
                            setItemQty(item.id, quantity - 1, max)
                          }
                          aria-label={`Quitar ${item.name}`}
                        >
                          <Minus />
                        </Button>
                        <span className="w-6 text-center font-mono text-sm tabular-nums">
                          {quantity}
                        </span>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="outline"
                          disabled={soldOut || quantity >= max || pending}
                          onClick={() =>
                            setItemQty(item.id, quantity + 1, max)
                          }
                          aria-label={`Sumar ${item.name}`}
                        >
                          <Plus />
                        </Button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )
        })}
      </div>

      {selection.length > 0 ? (
        <div className="mt-5 flex flex-col gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Total extras:{" "}
            <span className="font-bold text-zinc-900 dark:text-white">
              {formatCurrency(total)}
            </span>
          </p>
          <Button
            type="button"
            disabled={!canPurchase || pending}
            className="h-11 rounded-full bg-violet-600 text-white hover:bg-violet-500"
            onClick={handleCheckout}
          >
            {pending ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <ShoppingBag aria-hidden="true" />
            )}
            {pending ? "Procesando…" : "Comprar extras"}
          </Button>
        </div>
      ) : null}
    </section>
  )
}
