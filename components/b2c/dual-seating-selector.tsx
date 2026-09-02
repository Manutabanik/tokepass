"use client"

import {
  ArrowLeft,
  ArrowRight,
  Armchair,
  CheckCircle2,
  Clock3,
  List,
  LoaderCircle,
  Presentation,
  Sparkles,
  Users,
} from "lucide-react"
import { useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { reserveSeatAtomic } from "@/app/actions/checkout"
import { CheckoutBuyerFields } from "@/components/public/checkout-buyer-fields"
import { Button } from "@/components/ui/button"
import {
  getCheckoutBuyerFieldErrors,
  validateCheckoutBuyer,
  type CheckoutBuyerInfo,
} from "@/lib/checkout-buyer"
import {
  firstCheckoutBuyerErrorField,
  onValidationError,
} from "@/lib/checkout/validation-scroll"
import {
  getCheckoutDwellMs,
  getCheckoutCaptchaToken,
  getOrCreateDeviceHash,
} from "@/lib/checkout/client-security"
import { formatCurrency } from "@/lib/format"
import { SEATING_HOLD_MINUTES } from "@/lib/checkout-hold"
import { redirectToCheckoutPaymentOrToast } from "@/lib/checkout-redirect"
import { cn } from "@/lib/utils"
import type { EventSeatingUnit } from "@/types/venues"

type SeatingTier = {
  id: string
  name: string
  price: number
  capacityPerUnit: number
}

type RowGroup = {
  id: string
  label: string
  number: number
  units: EventSeatingUnit[]
}

const COLLISION_MESSAGE =
  "Esta ubicación acaba de ser reservada por otra persona. Por favor elegí otra."

function rowDescription(rowNumber: number): string {
  if (rowNumber === 1) return "Más cerca del escenario"
  if (rowNumber === 2) return "Zona media"
  return "Sector posterior"
}

function unitNumber(unit: EventSeatingUnit): string {
  return unit.label.replace(/\D+/g, "").slice(-3) || unit.label
}

function unitStatusLabel(unit: EventSeatingUnit): string {
  return unit.status === "available" ? "Disponible" : "No disponible"
}

function compareUnits(a: EventSeatingUnit, b: EventSeatingUnit): number {
  const aNumber = Number(a.layoutItemId.match(/\d+/)?.[0])
  const bNumber = Number(b.layoutItemId.match(/\d+/)?.[0])
  if (
    Number.isFinite(aNumber) &&
    Number.isFinite(bNumber) &&
    aNumber !== bNumber
  ) {
    return aNumber - bNumber
  }
  if (a.layoutItemId === b.layoutItemId) return 0
  return a.layoutItemId < b.layoutItemId ? -1 : 1
}

export function DualSeatingSelector({
  eventId,
  currentUserId,
  buyer: initialBuyer,
  tier,
  units,
  backgroundUrl,
  referralCode,
  onClose,
}: {
  eventId: string
  currentUserId: string | null
  buyer?: CheckoutBuyerInfo | null
  tier: SeatingTier
  units: EventSeatingUnit[]
  backgroundUrl?: string | null
  referralCode?: string | null
  onClose: () => void
}) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState("")
  const [isPending, startTransition] = useTransition()
  const [buyer, setBuyer] = useState<CheckoutBuyerInfo>({
    buyerName: initialBuyer?.buyerName ?? "",
    buyerDni: initialBuyer?.buyerDni ?? "",
    buyerEmail: initialBuyer?.buyerEmail ?? "",
    buyerPhone: initialBuyer?.buyerPhone ?? "",
  })
  const [showBuyerErrors, setShowBuyerErrors] = useState(false)
  const mapNodes = useRef(new Map<string, SVGGElement>())
  const listNodes = useRef(new Map<string, HTMLButtonElement>())

  const selected = units.find((unit) => unit.id === selectedId) ?? null
  const rowGroups = useMemo<RowGroup[]>(() => {
    const groups = new Map<string, RowGroup>()

    for (const unit of units) {
      const key = unit.rowId ?? `legacy-${unit.sectorId}`
      const current = groups.get(key)
      if (current) {
        current.units.push(unit)
        continue
      }

      groups.set(key, {
        id: key,
        label: unit.rowLabel ?? "Ubicaciones",
        number: unit.rowNumber ?? Number.MAX_SAFE_INTEGER,
        units: [unit],
      })
    }

    return [...groups.values()]
      .map((group) => ({
        ...group,
        units: [...group.units].sort(compareUnits),
      }))
      .sort(
        (a, b) =>
          a.number - b.number ||
          (a.label === b.label ? 0 : a.label < b.label ? -1 : 1),
      )
      .map((group, index) => ({
        ...group,
        number:
          group.number === Number.MAX_SAFE_INTEGER ? index + 1 : group.number,
      }))
  }, [units])

  const maxItemsInRow = Math.max(
    1,
    ...rowGroups.map((group) => group.units.length),
  )
  const viewBoxWidth = Math.max(680, maxItemsInRow * 58 + 180)
  const viewBoxHeight = Math.max(280, rowGroups.length * 82 + 130)

  if (units.length === 0) {
    return (
      <section className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-6 text-center shadow-2xl shadow-black/50 backdrop-blur-xl">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-zinc-950 text-zinc-600 ring-1 ring-zinc-800">
          <Armchair className="size-5" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-lg font-bold text-white">
          No hay ubicaciones configuradas
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-zinc-500">
          Esta categoría todavía no tiene un plano numerado disponible.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          className="mt-5 rounded-full border-zinc-700 bg-zinc-950 text-zinc-300 hover:bg-zinc-800 hover:text-white"
        >
          <ArrowLeft aria-hidden="true" />
          Volver a las entradas
        </Button>
      </section>
    )
  }

  function selectFromMap(unit: EventSeatingUnit) {
    if (unit.status !== "available" || isPending) return
    setSelectedId(unit.id)
    window.requestAnimationFrame(() => {
      listNodes.current.get(unit.id)?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      })
    })
  }

  function selectFromList(unit: EventSeatingUnit) {
    if (unit.status !== "available" || isPending) return
    setSelectedId(unit.id)
    window.requestAnimationFrame(() => {
      const node = mapNodes.current.get(unit.id)
      node?.focus({ preventScroll: true })
      node?.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "center",
      })
    })
  }

  function continueToPayment() {
    if (!selected || isPending) return

    if (!currentUserId) {
      router.push(`/login?next=/events/${eventId}`)
      return
    }

    const buyerCheck = validateCheckoutBuyer(buyer)
    if (!buyerCheck.ok) {
      setShowBuyerErrors(true)
      const field = firstCheckoutBuyerErrorField(
        getCheckoutBuyerFieldErrors(buyer),
      )
      onValidationError(field)
      return
    }

    startTransition(async () => {
      const result = await reserveSeatAtomic(
        eventId,
        selected.id,
        currentUserId,
        referralCode,
        buyerCheck.buyer,
        null,
        undefined,
        {
          captchaToken: await getCheckoutCaptchaToken(),
          deviceHash: getOrCreateDeviceHash(),
          dwellMs: getCheckoutDwellMs(),
        },
      )

      if (!result.success) {
        if (result.error === "auth_required") {
          router.push(`/login?next=/events/${eventId}`)
          return
        }

        if (result.error === COLLISION_MESSAGE) {
          toast.error(COLLISION_MESSAGE)
          setSelectedId("")
          router.refresh()
          return
        }

        toast.error("No se pudo reservar la ubicación", {
          description: result.error,
        })
        return
      }

      redirectToCheckoutPaymentOrToast(result.paymentUrl ?? result.initPoint)
    })
  }

  const selectionTitle = selected
    ? tier.name.toUpperCase().includes(selected.label.toUpperCase())
      ? tier.name.toUpperCase()
      : `${tier.name} ${selected.label}`.toUpperCase()
    : ""

  return (
    <section className="relative rounded-3xl border border-zinc-800 bg-zinc-900/80 p-4 pb-24 shadow-2xl shadow-black/50 backdrop-blur-xl sm:p-6 sm:pb-24">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-purple-300">
            Selector dual de ubicaciones
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-white">
            Elegí tu ubicación numerada
          </h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-zinc-400">
            Tocá una ubicación en el plano o elegila en la lista. Las dos
            vistas permanecen sincronizadas.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={isPending}
          className="rounded-full border-zinc-700 bg-zinc-950/70 text-zinc-300 hover:bg-zinc-800 hover:text-white"
        >
          <ArrowLeft aria-hidden="true" />
          Volver
        </Button>
      </div>

      <div className="mt-6 grid gap-5">
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-sm font-bold text-white">
              <Presentation className="size-4 text-purple-300" />
              Mapa geométrico
            </h3>
            <div className="flex flex-wrap gap-3 text-[10px] text-zinc-500">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full border border-emerald-400 bg-emerald-500/20" />
                Disponible
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full border border-zinc-600 bg-zinc-800" />
                Ocupada
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full border border-purple-300 bg-purple-600 shadow-[0_0_8px_rgba(147,51,234,0.7)]" />
                Seleccionada
              </span>
            </div>
          </div>

          <div className="relative overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-950/80 shadow-inner shadow-black/70">
            {backgroundUrl ? (
              <div
                className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-15"
                style={{ backgroundImage: `url("${backgroundUrl}")` }}
                aria-hidden="true"
              />
            ) : null}
            <svg
              viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
              className="relative block h-auto min-h-72 w-full"
              style={{ minWidth: Math.min(viewBoxWidth, 960) }}
              role="group"
              aria-label={`Plano de ubicaciones para ${tier.name}`}
            >
              <defs>
                <filter id={`selected-glow-${tier.id}`}>
                  <feGaussianBlur stdDeviation="5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <linearGradient
                  id={`stage-gradient-${tier.id}`}
                  x1="0"
                  x2="1"
                >
                  <stop offset="0%" stopColor="rgba(126,34,206,0.22)" />
                  <stop offset="50%" stopColor="rgba(79,70,229,0.4)" />
                  <stop offset="100%" stopColor="rgba(16,185,129,0.18)" />
                </linearGradient>
              </defs>

              <rect
                x={viewBoxWidth / 2 - 150}
                y={18}
                width={300}
                height={42}
                rx={14}
                fill={`url(#stage-gradient-${tier.id})`}
                stroke="rgba(196,181,253,0.6)"
              />
              <path
                d={`M ${viewBoxWidth / 2 - 112} 40 l 7 -7 l 7 7 l -7 7 z`}
                fill="#C4B5FD"
                aria-hidden="true"
              />
              <text
                x={viewBoxWidth / 2 + 10}
                y={44}
                textAnchor="middle"
                className="fill-purple-100 text-[12px] font-black tracking-[0.18em]"
              >
                ESCENARIO / FRENTE
              </text>

              {rowGroups.map((group, rowIndex) => {
                const gap = Math.max(
                  46,
                  Math.min(62, (viewBoxWidth - 180) / group.units.length),
                )
                const span = Math.max(0, group.units.length - 1) * gap
                const startX = (viewBoxWidth - span) / 2
                const y = 102 + rowIndex * 82
                const firstRow = group.number === 1

                return (
                  <g key={group.id}>
                    <text
                      x={24}
                      y={y + 4}
                      className={cn(
                        "text-[10px] font-bold",
                        firstRow ? "fill-amber-300" : "fill-zinc-500",
                      )}
                    >
                      {firstRow ? "PRIMERA FILA" : group.label.slice(0, 22)}
                    </text>
                    {firstRow ? (
                      <path
                        d={`M 28 ${y - 18} l 4 7 l 8 1 l -6 6 l 2 8 l -8 -4 l -7 4 l 1 -8 l -6 -6 l 8 -1 z`}
                        fill="rgba(251,191,36,0.9)"
                        filter={`url(#selected-glow-${tier.id})`}
                        aria-hidden="true"
                      />
                    ) : null}

                    {group.units.map((unit, itemIndex) => {
                      const x = startX + itemIndex * gap
                      const available = unit.status === "available"
                      const active = selectedId === unit.id

                      return (
                        <g
                          key={unit.id}
                          ref={(node) => {
                            if (node) mapNodes.current.set(unit.id, node)
                            else mapNodes.current.delete(unit.id)
                          }}
                          role="button"
                          tabIndex={available && !isPending ? 0 : -1}
                          aria-label={`${unit.label}, fila ${group.number}, ${unitStatusLabel(unit)}`}
                          aria-pressed={active}
                          aria-disabled={!available || isPending}
                          onClick={() => selectFromMap(unit)}
                          onKeyDown={(event) => {
                            if (
                              available &&
                              !isPending &&
                              (event.key === "Enter" || event.key === " ")
                            ) {
                              event.preventDefault()
                              selectFromMap(unit)
                            }
                          }}
                          className={cn(
                            "outline-none transition",
                            available && !isPending
                              ? "cursor-pointer"
                              : "cursor-not-allowed",
                          )}
                          style={{
                            filter: active
                              ? `url(#selected-glow-${tier.id})`
                              : undefined,
                          }}
                        >
                          <circle
                            cx={x}
                            cy={y}
                            r={active ? 24 : 20}
                            fill={
                              active
                                ? "#7C3AED"
                                : available
                                  ? "rgba(16,185,129,0.12)"
                                  : "#27272A"
                            }
                            stroke={
                              active
                                ? "#C4B5FD"
                                : available
                                  ? unit.color || "#34D399"
                                  : "#3F3F46"
                            }
                            strokeWidth={active ? 3.5 : available ? 2.5 : 1.5}
                          />
                          <text
                            x={x}
                            y={y + 4}
                            textAnchor="middle"
                            className={cn(
                              "pointer-events-none fill-current font-mono text-[10px] font-black",
                              active
                                ? "text-white"
                                : available
                                  ? "text-emerald-200"
                                  : "text-zinc-600",
                            )}
                          >
                            {unitNumber(unit)}
                          </text>
                        </g>
                      )
                    })}
                  </g>
                )
              })}
            </svg>
          </div>
        </div>

        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-bold text-white">
            <List className="size-4 text-emerald-400" />
            Lista accesible por fila
          </h3>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            Elegí una opción disponible. El plano enfocará automáticamente la
            ubicación.
          </p>

          <div className="mt-3 max-h-[430px] space-y-4 overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950/65 p-3">
            {rowGroups.map((group) => (
              <section key={group.id} aria-labelledby={`row-${group.id}`}>
                <div className="sticky top-0 z-10 flex items-center gap-2 border-y border-zinc-800 bg-zinc-950/95 px-2 py-2 backdrop-blur">
                  {group.number === 1 ? (
                    <Sparkles
                      className="size-3.5 text-amber-300"
                      aria-hidden="true"
                    />
                  ) : (
                    <Armchair
                      className="size-3.5 text-zinc-600"
                      aria-hidden="true"
                    />
                  )}
                  <h4
                    id={`row-${group.id}`}
                    className={cn(
                      "text-[11px] font-black uppercase tracking-[0.12em]",
                      group.number === 1
                        ? "text-amber-200"
                        : "text-zinc-400",
                    )}
                  >
                    Fila {group.number} · {rowDescription(group.number)}
                  </h4>
                </div>

                <div className="mt-2 space-y-1.5">
                  {group.units.map((unit, index) => {
                    const available = unit.status === "available"
                    const active = selectedId === unit.id
                    const isCenter =
                      group.units.length > 2 &&
                      index === Math.floor((group.units.length - 1) / 2)

                    return (
                      <button
                        key={unit.id}
                        ref={(node) => {
                          if (node) listNodes.current.set(unit.id, node)
                          else listNodes.current.delete(unit.id)
                        }}
                        type="button"
                        disabled={!available || isPending}
                        onClick={() => selectFromList(unit)}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition",
                          active
                            ? "border-purple-400 bg-purple-600/25 text-white shadow-[0_0_15px_rgba(147,51,234,0.35)]"
                            : available
                              ? "border-emerald-500/20 bg-emerald-500/5 text-zinc-200 hover:border-emerald-400/50 hover:bg-emerald-500/10"
                              : "cursor-not-allowed border-zinc-800 bg-zinc-900 text-zinc-600 opacity-70",
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold">
                            {unit.label}
                            {isCenter ? " · Centro" : ""}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-current opacity-65">
                            Fila {group.number} · {unit.sectorName}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block font-mono text-xs font-bold">
                            {formatCurrency(tier.price)}
                          </span>
                          <span
                            className={cn(
                              "mt-0.5 block text-[10px] uppercase",
                              available
                                ? "text-emerald-400"
                                : "text-zinc-600",
                            )}
                          >
                            {unitStatusLabel(unit)}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>

      {selected ? (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-800 bg-zinc-950/95 p-4 shadow-[0_-20px_50px_rgba(0,0,0,0.55)] backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl flex-col gap-4">
          <div id="checkout-buyer">
            <CheckoutBuyerFields
              value={buyer}
              errors={
                showBuyerErrors ? getCheckoutBuyerFieldErrors(buyer) : undefined
              }
              onChange={setBuyer}
              disabled={isPending}
            />
          </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-purple-500/15 text-purple-200 ring-1 ring-purple-400/30">
                <CheckCircle2 className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-base font-black text-white">
                  {selectionTitle}
                </p>
                <p className="mt-0.5 truncate text-xs font-semibold uppercase tracking-wide text-purple-300">
                  {selected.sectorName}
                  {selected.rowLabel ? ` · ${selected.rowLabel}` : ""}
                  {selected.rowNumber === 1
                    ? " · Frente al escenario"
                    : ""}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-zinc-400">
                  <Users className="size-4" aria-hidden="true" />
                  Incluye acceso para {selected.capacityPerUnit}{" "}
                  {selected.capacityPerUnit === 1 ? "persona" : "personas"}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-2 sm:items-end">
              <Button
                type="button"
                disabled={isPending}
                onClick={continueToPayment}
                className="h-14 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-6 font-black text-white shadow-[0_0_25px_rgba(124,58,237,0.38)] hover:from-purple-500 hover:to-indigo-500"
              >
                {isPending ? (
                  <>
                    <LoaderCircle className="animate-spin" aria-hidden="true" />
                    Reservando ubicación
                  </>
                ) : (
                  <>
                    Continuar al pago · {formatCurrency(tier.price)}
                    <ArrowRight aria-hidden="true" />
                  </>
                )}
              </Button>
              <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                <Clock3 className="size-3.5" aria-hidden="true" />
                Al continuar, se reserva durante {SEATING_HOLD_MINUTES} minutos.
              </p>
            </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
