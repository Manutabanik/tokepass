"use client"

import {
  Armchair,
  CheckCircle2,
  ListFilter,
  MoveRight,
  Users,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import { startCheckoutWithPayment } from "@/app/actions/checkout"
import { CheckoutCountdown } from "@/components/public/checkout-countdown"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { EventSeatingUnit } from "@/types/venues"

type SeatingTier = {
  id: string
  name: string
  price: number
  capacityPerUnit: number
}

export function SeatingSelector({
  open,
  onOpenChange,
  eventId,
  tier,
  units,
  backgroundUrl,
  referralCode,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  eventId: string
  tier: SeatingTier
  units: EventSeatingUnit[]
  backgroundUrl?: string | null
  referralCode?: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [selectedId, setSelectedId] = useState("")
  const [checkout, setCheckout] = useState<{
    initPoint: string
    expiresAt: string
  } | null>(null)

  const selected = units.find((unit) => unit.id === selectedId) ?? null
  const rowGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        id: string
        label: string
        number: number
        units: EventSeatingUnit[]
      }
    >()
    for (const unit of units) {
      const key = unit.rowId ?? "legacy"
      const current = groups.get(key)
      if (current) {
        current.units.push(unit)
      } else {
        groups.set(key, {
          id: key,
          label: unit.rowLabel ?? "Ubicaciones",
          number: unit.rowNumber ?? Number.MAX_SAFE_INTEGER,
          units: [unit],
        })
      }
    }
    return [...groups.values()].sort(
      (a, b) => a.number - b.number || a.label.localeCompare(b.label),
    )
  }, [units])

  function beginReservation() {
    if (!selected || pending || checkout) return

    startTransition(async () => {
      const result = await startCheckoutWithPayment(
        eventId,
        [{ tierId: tier.id, quantity: 1, seatingUnitId: selected.id }],
        referralCode,
      )

      if (!result.success) {
        if (result.error === "auth_required") {
          router.push(`/login?next=/events/${eventId}`)
          return
        }
        if (result.error === "out_of_stock") {
          toast.error("Esa ubicación acaba de ser reservada.", {
            description: "Actualizamos el plano para que elijas otra.",
          })
          router.refresh()
          return
        }
        toast.error("No se pudo reservar la ubicación", {
          description: result.error,
        })
        return
      }

      if (result.initPoint.startsWith("/")) {
        window.location.href = result.initPoint
        return
      }

      setCheckout({
        initPoint: result.initPoint,
        expiresAt: result.expiresAt,
      })
      toast.success("Ubicación reservada. Completá el pago a tiempo.")
    })
  }

  const maxItemsInRow = Math.max(
    1,
    ...rowGroups.map((group) => group.units.length),
  )
  const viewBoxWidth = Math.max(640, maxItemsInRow * 52 + 150)
  const viewBoxHeight = Math.max(220, rowGroups.length * 76 + 110)

  return (
    <Dialog open={open} onOpenChange={checkout ? undefined : onOpenChange}>
      <DialogContent className="max-h-[94dvh] gap-0 overflow-hidden border-zinc-800 bg-zinc-950 p-0 text-zinc-100 shadow-2xl sm:max-w-3xl max-sm:bottom-0 max-sm:left-0 max-sm:top-auto max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none">
        <DialogHeader className="border-b border-zinc-800 bg-zinc-900/80 px-5 py-5 pr-12 sm:px-7">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-white">
            <Armchair className="size-5 text-emerald-400" aria-hidden="true" />
            Elegí tu ubicación
          </DialogTitle>
          <DialogDescription className="text-sm text-zinc-400">
            Podés elegir por número en la lista o tocarlo directamente en el
            plano. Ambas opciones están sincronizadas.
          </DialogDescription>
        </DialogHeader>

        {checkout ? (
          <div className="border-b border-zinc-800 px-5 py-3 sm:px-7">
            <CheckoutCountdown
              expiresAt={checkout.expiresAt}
              redirectTo={`/events/${eventId}`}
              onExpired={() => {
                setCheckout(null)
                setSelectedId("")
              }}
            />
          </div>
        ) : null}

        <div className="overflow-y-auto px-5 py-5 sm:px-7">
          <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="flex items-start gap-3">
              <ListFilter
                className="mt-0.5 size-5 shrink-0 text-emerald-400"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <label
                  htmlFor={`seating-list-${tier.id}`}
                  className="block text-sm font-bold text-white"
                >
                  ¿Preferís no buscar en el plano? Elegí tu número acá
                </label>
                <select
                  id={`seating-list-${tier.id}`}
                  value={selectedId}
                  disabled={Boolean(checkout)}
                  onChange={(event) => setSelectedId(event.target.value)}
                  className="mt-3 h-14 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-base font-semibold text-white outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                >
                  <option value="">Seleccioná una ubicación disponible</option>
                  {rowGroups.map((group) => {
                    const availableInRow = group.units.filter(
                      (unit) => unit.status === "available",
                    )
                    if (availableInRow.length === 0) return null
                    return (
                      <optgroup
                        key={group.id}
                        label={`${group.label} · ${availableInRow.length} disponibles`}
                      >
                        {availableInRow.map((unit) => (
                          <option key={unit.id} value={unit.id}>
                            {unit.label} · {formatCurrency(tier.price)} · Libre
                          </option>
                        ))}
                      </optgroup>
                    )
                  })}
                </select>
              </div>
            </div>
          </section>

          <section className="mt-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-white">Plano táctil</h3>
              <div className="flex gap-3 text-[10px] text-zinc-500">
                <span>Verde: disponible</span>
                <span>Gris: ocupada</span>
                <span>Índigo: elegida</span>
              </div>
            </div>
            <div className="relative overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/60">
              {backgroundUrl ? (
                <div
                  className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-25"
                  style={{ backgroundImage: `url("${backgroundUrl}")` }}
                  aria-hidden="true"
                />
              ) : null}
              <svg
                viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
                className="relative block h-auto min-h-56 w-full"
                style={{ minWidth: Math.min(viewBoxWidth, 900) }}
                role="group"
                aria-label={`Plano de ubicaciones de ${tier.name}`}
              >
                <rect
                  x={viewBoxWidth / 2 - 120}
                  y={20}
                  width={240}
                  height={34}
                  rx={12}
                  fill="rgba(99,102,241,0.18)"
                  stroke="rgba(129,140,248,0.55)"
                />
                <text
                  x={viewBoxWidth / 2}
                  y={42}
                  textAnchor="middle"
                  className="fill-indigo-200 text-[12px] font-black tracking-[0.16em]"
                >
                  ESCENARIO / FRENTE
                </text>
                {rowGroups.map((group, rowIndex) => {
                  const gap = 52
                  const span = Math.max(0, group.units.length - 1) * gap
                  const startX = (viewBoxWidth - span) / 2
                  const y = 92 + rowIndex * 76
                  return (
                    <g key={group.id}>
                      <text
                        x={20}
                        y={y + 4}
                        className="fill-zinc-500 text-[10px] font-semibold"
                      >
                        {group.label.slice(0, 24)}
                      </text>
                      {group.units.map((unit, itemIndex) => {
                        const x = startX + itemIndex * gap
                        const available = unit.status === "available"
                        const active = selectedId === unit.id
                        return (
                          <g
                            key={unit.id}
                      role="button"
                      tabIndex={available && !checkout ? 0 : -1}
                      aria-label={`${unit.label}, ${
                        available ? "disponible" : "ocupada"
                      }`}
                      aria-pressed={active}
                      aria-disabled={!available || Boolean(checkout)}
                      onClick={() => {
                        if (available && !checkout) setSelectedId(unit.id)
                      }}
                      onKeyDown={(event) => {
                        if (
                          available &&
                          !checkout &&
                          (event.key === "Enter" || event.key === " ")
                        ) {
                          event.preventDefault()
                          setSelectedId(unit.id)
                        }
                      }}
                      className={cn(
                        "outline-none transition",
                        available && !checkout
                          ? "cursor-pointer"
                          : "cursor-not-allowed",
                      )}
                    >
                            <circle
                        cx={x}
                        cy={y}
                              r={active ? 22 : 19}
                        fill={
                          active
                            ? "#4F46E5"
                            : available
                              ? "rgba(16,185,129,0.16)"
                              : "#18181B"
                        }
                        stroke={
                          active
                            ? "#818CF8"
                            : available
                              ? unit.color
                              : "#3F3F46"
                        }
                        strokeWidth={active || available ? 3 : 1.5}
                            />
                            <text
                        x={x}
                        y={y + 4}
                        textAnchor="middle"
                        className={cn(
                          "pointer-events-none fill-current font-mono text-[10px] font-bold",
                          active
                            ? "text-white"
                            : available
                              ? "text-emerald-300"
                              : "text-zinc-600",
                        )}
                            >
                              {unit.label.replace(/\D+/g, "").slice(-3) ||
                                String(itemIndex + 1)}
                            </text>
                          </g>
                        )
                      })}
                    </g>
                  )
                })}
              </svg>
            </div>
          </section>
        </div>

        <div className="border-t border-zinc-800 bg-zinc-900/95 p-5 shadow-[0_-15px_40px_rgba(0,0,0,0.35)] sm:px-7">
          {selected ? (
            <div className="mb-4 flex items-start gap-3">
              <CheckCircle2
                className="mt-0.5 size-5 shrink-0 text-emerald-400"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-black uppercase text-white">
                  {selected.label}
                </p>
                <p className="mt-0.5 text-xs font-semibold uppercase text-indigo-300">
                  {selected.sectorName}
                  {selected.rowLabel ? ` · ${selected.rowLabel}` : null}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-zinc-400">
                  <Users className="size-4" aria-hidden="true" />
                  Incluye acceso para {selected.capacityPerUnit}{" "}
                  {selected.capacityPerUnit === 1 ? "persona" : "personas"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                  Precio final
                </p>
                <p className="font-mono text-lg font-black text-white">
                  {formatCurrency(tier.price)}
                </p>
              </div>
            </div>
          ) : (
            <p className="mb-4 text-center text-sm text-zinc-500">
              Elegí una ubicación para continuar.
            </p>
          )}

          {checkout ? (
            <a
              href={checkout.initPoint}
              className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#009EE3] px-5 text-sm font-black text-white transition hover:bg-[#08A8EE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              Ir a pagar con Mercado Pago
              <MoveRight className="size-5" aria-hidden="true" />
            </a>
          ) : (
            <button
              type="button"
              disabled={!selected || pending}
              onClick={beginReservation}
              className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-black text-zinc-950 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? "Reservando ubicación…" : "Reservar y continuar"}
              <MoveRight className="size-5" aria-hidden="true" />
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
