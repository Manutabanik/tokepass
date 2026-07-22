"use client"

import { GlassWater, LoaderCircle, Minus, Plus, Ticket } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import { startCheckoutWithPayment } from "@/app/actions/checkout"
import type { EventItem } from "@/app/actions/addons"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { MAX_TICKETS_PER_PURCHASE } from "@/lib/checkout-limits"
import { formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"

export type TicketSelectorTier = {
  id: string
  name: string
  price: number
  available: number
  bonusReward?: string | null
}

type TicketSelectorProps = {
  eventId: string
  tiers: TicketSelectorTier[]
  barItems?: EventItem[]
  /** Fracción decimal, ej. 0.15 = 15% */
  serviceChargeRate?: number
  /** Código RRPP desde ?ref= — nunca se envía promoter_id al servidor */
  referralCode?: string | null
}

const REF_STORAGE_KEY = "tokepass_ref"
const DEFAULT_SERVICE_CHARGE_RATE = 0.15
const MAX_ADDONS_PER_ITEM = 10

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

export function TicketSelector({
  eventId,
  tiers,
  barItems = [],
  serviceChargeRate = DEFAULT_SERVICE_CHARGE_RATE,
  referralCode = null,
}: TicketSelectorProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(tiers.map((tier) => [tier.id, 0])),
  )
  const [addonQuantities, setAddonQuantities] = useState<Record<string, number>>(
    () => Object.fromEntries(barItems.map((item) => [item.id, 0])),
  )
  const [storedRef] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    return sessionStorage.getItem(REF_STORAGE_KEY)
  })

  const resolvedRef = referralCode?.trim() || storedRef

  useEffect(() => {
    const clean = referralCode?.trim()
    if (!clean) return
    sessionStorage.setItem(REF_STORAGE_KEY, clean)
  }, [referralCode])

  const barItemsKey = barItems.map((item) => item.id).join("|")
  const [prevBarItemsKey, setPrevBarItemsKey] = useState(barItemsKey)
  if (barItemsKey !== prevBarItemsKey) {
    setPrevBarItemsKey(barItemsKey)
    setAddonQuantities((current) => {
      const next: Record<string, number> = {}
      for (const item of barItems) {
        next[item.id] = current[item.id] ?? 0
      }
      return next
    })
  }

  const selection = useMemo(
    () =>
      tiers
        .map((tier) => {
          const quantity = quantities[tier.id] ?? 0
          return {
            ...tier,
            quantity,
            subtotal: quantity * tier.price,
            maxSelectable: Math.min(
              MAX_TICKETS_PER_PURCHASE,
              Math.max(0, tier.available),
            ),
          }
        })
        .filter((tier) => tier.quantity > 0),
    [quantities, tiers],
  )

  const addonSelection = useMemo(
    () =>
      barItems
        .map((item) => {
          const quantity = addonQuantities[item.id] ?? 0
          return {
            ...item,
            quantity,
            subtotal: quantity * item.price,
            maxSelectable: Math.min(MAX_ADDONS_PER_ITEM, Math.max(0, item.stock)),
          }
        })
        .filter((item) => item.quantity > 0),
    [addonQuantities, barItems],
  )

  const totalTickets = selection.reduce((sum, tier) => sum + tier.quantity, 0)
  const totalAddons = addonSelection.reduce((sum, item) => sum + item.quantity, 0)
  const ticketsSubtotal = roundMoney(
    selection.reduce((sum, tier) => sum + tier.subtotal, 0),
  )
  const addonsSubtotal = roundMoney(
    addonSelection.reduce((sum, item) => sum + item.subtotal, 0),
  )
  const subtotal = roundMoney(ticketsSubtotal + addonsSubtotal)
  const serviceCharge = roundMoney(ticketsSubtotal * serviceChargeRate)
  const totalAmount = roundMoney(subtotal + serviceCharge)

  function updateQuantity(tierId: string, next: number, max: number) {
    setQuantities((current) => ({
      ...current,
      [tierId]: Math.min(Math.max(0, next), max),
    }))
  }

  function updateAddonQuantity(itemId: string, next: number, max: number) {
    setAddonQuantities((current) => ({
      ...current,
      [itemId]: Math.min(Math.max(0, next), max),
    }))
  }

  function handleReserve() {
    if (selection.length === 0 || isPending) return

    startTransition(async () => {
      const result = await startCheckoutWithPayment(
        eventId,
        selection.map((tier) => ({
          tierId: tier.id,
          quantity: tier.quantity,
        })),
        resolvedRef,
        addonSelection.map((item) => ({
          itemId: item.id,
          quantity: item.quantity,
        })),
      )

      if (!result.success) {
        if (result.error === "auth_required") {
          router.push(`/login?next=/events/${eventId}`)
          return
        }

        if (result.error === "out_of_stock") {
          toast.error("Stock insuficiente (entradas o consumiciones)")
          router.refresh()
          return
        }

        toast.error("No se pudo iniciar el pago", {
          description: result.error,
        })
        router.refresh()
        return
      }

      toast.success("Redirigiendo a Mercado Pago…")
      window.location.href = result.initPoint
    })
  }

  if (tiers.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-zinc-800 bg-zinc-900/50 px-5 py-10 text-center">
        <Ticket className="mx-auto size-8 text-zinc-600" aria-hidden="true" />
        <p className="mt-3 text-sm text-zinc-500">
          Este evento todavía no tiene tipos de entrada configurados.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-2xl shadow-black/40 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400/90">
            Entradas
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-white">
            Elegí tu experiencia
          </h2>
        </div>
        <span className="rounded-full bg-zinc-950 px-2.5 py-1 text-xs font-medium text-zinc-500 ring-1 ring-zinc-800">
          Máx. {MAX_TICKETS_PER_PURCHASE} por compra
        </span>
      </div>

      <div className="mt-5 space-y-3">
        {tiers.map((tier) => {
          const quantity = quantities[tier.id] ?? 0
          const maxSelectable = Math.min(
            MAX_TICKETS_PER_PURCHASE,
            Math.max(0, tier.available),
          )
          const soldOut = maxSelectable <= 0

          return (
            <div
              key={tier.id}
              className={cn(
                "rounded-2xl border px-4 py-4 transition",
                quantity > 0
                  ? "border-emerald-500/40 bg-emerald-500/10"
                  : "border-zinc-800 bg-zinc-950/60",
                soldOut && "opacity-60",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-white">{tier.name}</p>
                  {tier.bonusReward ? (
                    <p className="mt-1 text-xs text-emerald-300">
                      {tier.bonusReward}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-zinc-500">
                    {soldOut ? "Agotado" : `${tier.available} disponibles`}
                  </p>
                </div>
                <p className="shrink-0 text-lg font-bold tracking-tight text-white">
                  {formatCurrency(tier.price)}
                </p>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-zinc-500">
                  Cantidad
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    disabled={soldOut || quantity === 0 || isPending}
                    onClick={() =>
                      updateQuantity(tier.id, quantity - 1, maxSelectable)
                    }
                    aria-label={`Quitar ${tier.name}`}
                    className="rounded-full border-zinc-700 bg-zinc-950 text-zinc-200 hover:bg-zinc-900"
                  >
                    <Minus />
                  </Button>
                  <span className="w-8 text-center text-sm font-semibold tabular-nums text-white">
                    {quantity}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    disabled={
                      soldOut || quantity >= maxSelectable || isPending
                    }
                    onClick={() =>
                      updateQuantity(tier.id, quantity + 1, maxSelectable)
                    }
                    aria-label={`Agregar ${tier.name}`}
                    className="rounded-full border-zinc-700 bg-zinc-950 text-zinc-200 hover:bg-zinc-900"
                  >
                    <Plus />
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {barItems.length > 0 ? (
        <>
          <Separator className="my-5 bg-zinc-800" />
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30">
              <GlassWater className="size-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-400/90">
                Barra
              </p>
              <h3 className="mt-1 text-lg font-bold tracking-tight text-white">
                Añade tus Consumiciones con Descuento
              </h3>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                Opcional. Se suman a tu orden y las canjeás en barra con QR
                vivo.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {barItems.map((item) => {
              const quantity = addonQuantities[item.id] ?? 0
              const maxSelectable = Math.min(
                MAX_ADDONS_PER_ITEM,
                Math.max(0, item.stock),
              )
              const soldOut = maxSelectable <= 0

              return (
                <div
                  key={item.id}
                  className={cn(
                    "rounded-2xl border px-4 py-4 transition",
                    quantity > 0
                      ? "border-amber-500/40 bg-amber-500/10"
                      : "border-zinc-800 bg-zinc-950/60",
                    soldOut && "opacity-60",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-white">{item.name}</p>
                      {item.description ? (
                        <p className="mt-1 text-xs text-zinc-400">
                          {item.description}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-zinc-500">
                        {soldOut
                          ? "Agotado"
                          : `${item.stock} en stock`}
                      </p>
                    </div>
                    <p className="shrink-0 text-lg font-bold tracking-tight text-white">
                      {formatCurrency(item.price)}
                    </p>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-zinc-500">
                      Cantidad
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        disabled={soldOut || quantity === 0 || isPending}
                        onClick={() =>
                          updateAddonQuantity(item.id, quantity - 1, maxSelectable)
                        }
                        aria-label={`Quitar ${item.name}`}
                        className="rounded-full border-zinc-700 bg-zinc-950 text-zinc-200 hover:bg-zinc-900"
                      >
                        <Minus />
                      </Button>
                      <span className="w-8 text-center text-sm font-semibold tabular-nums text-white">
                        {quantity}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        disabled={
                          soldOut || quantity >= maxSelectable || isPending
                        }
                        onClick={() =>
                          updateAddonQuantity(item.id, quantity + 1, maxSelectable)
                        }
                        aria-label={`Agregar ${item.name}`}
                        className="rounded-full border-zinc-700 bg-zinc-950 text-zinc-200 hover:bg-zinc-900"
                      >
                        <Plus />
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      ) : null}

      <Separator className="my-5 bg-zinc-800" />

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500">
          Resumen de pago
        </p>
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex items-center justify-between text-zinc-400">
            <span>
              Entradas
              {totalTickets > 0
                ? ` · ${totalTickets} ${totalTickets === 1 ? "entrada" : "entradas"}`
                : null}
            </span>
            <span className="tabular-nums text-zinc-200">
              {formatCurrency(ticketsSubtotal)}
            </span>
          </div>
          {totalAddons > 0 ? (
            <div className="flex items-center justify-between text-zinc-400">
              <span>
                Consumiciones · {totalAddons}
              </span>
              <span className="tabular-nums text-zinc-200">
                {formatCurrency(addonsSubtotal)}
              </span>
            </div>
          ) : null}
          <div className="flex items-center justify-between text-zinc-400">
            <span>
              Cargo por servicio
              <span className="ml-1 text-zinc-600">
                ({Math.round(serviceChargeRate * 100)}% sobre entradas)
              </span>
            </span>
            <span className="tabular-nums text-zinc-200">
              {formatCurrency(serviceCharge)}
            </span>
          </div>
          <div className="border-t border-zinc-800 pt-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-zinc-300">Total a pagar</span>
              <span className="text-xl font-bold tracking-tight text-white tabular-nums">
                {formatCurrency(totalAmount)}
              </span>
            </div>
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-4 text-zinc-600">
          El cargo por servicio aplica solo a las entradas.
        </p>
      </div>

      <Button
        type="button"
        size="lg"
        disabled={totalTickets === 0 || isPending}
        onClick={handleReserve}
        className="mt-5 h-12 w-full rounded-full bg-white text-zinc-950 shadow-lg shadow-white/10 hover:bg-zinc-200 disabled:opacity-50"
      >
        {isPending ? (
          <>
            <LoaderCircle className="animate-spin" aria-hidden="true" />
            Preparando pago...
          </>
        ) : (
          "Pagar con Mercado Pago"
        )}
      </Button>
      <p className="mt-3 text-center text-xs text-zinc-500">
        Vas a ser redirigido a Checkout Pro de Mercado Pago.
      </p>
    </div>
  )
}
