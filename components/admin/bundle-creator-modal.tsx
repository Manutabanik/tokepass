"use client"

import {
  Armchair,
  CalendarDays,
  Car,
  Gift,
  Layers,
  LoaderCircle,
  Plus,
  Sparkles,
  Ticket,
  Trash2,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { formatCurrency } from "@/lib/format"
import {
  BUNDLE_TYPE_HINTS,
  BUNDLE_TYPE_LABELS,
  bundleSavings,
  regularBundlePrice,
  validateBundleDraft,
  type BundleComponent,
  type BundleType,
} from "@/lib/inventory/flexible-bundles"
import type { InventoryTierType } from "@/lib/inventory/unified-inventory"
import { cn } from "@/lib/utils"

export type BundleScheduleDay = {
  id: string
  title: string
}

export type BundleComponentOption = {
  id: string
  name: string
  price: number
  tierType: InventoryTierType
  dayId?: string | null
}

export type BundleCreatorValue = {
  name: string
  bundleType: BundleType
  price: number
  originalPrice: number
  capacity: number
  items: BundleComponent[]
  includesSeating: boolean
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  scheduleDays?: BundleScheduleDay[]
  options: BundleComponentOption[]
  initial?: Partial<BundleCreatorValue> | null
  pending?: boolean
  onSave: (value: BundleCreatorValue) => void
}

const TYPE_ICONS: Record<BundleType, typeof Gift> = {
  multi_day_pass: CalendarDays,
  cross_sell_pack: Gift,
  volume_discount: Layers,
}

export function BundleCreatorModal({
  open,
  onOpenChange,
  title = "Crear combo / abono",
  scheduleDays = [],
  options,
  initial,
  pending = false,
  onSave,
}: Props) {
  const [name, setName] = useState("")
  const [bundleType, setBundleType] = useState<BundleType>("cross_sell_pack")
  const [price, setPrice] = useState("0")
  const [capacity, setCapacity] = useState("50")
  const [items, setItems] = useState<BundleComponent[]>([])
  const [includesSeating, setIncludesSeating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? "")
    setBundleType(initial?.bundleType ?? "cross_sell_pack")
    setPrice(String(initial?.price ?? 0))
    setCapacity(String(initial?.capacity ?? 50))
    setItems(initial?.items ?? [])
    setIncludesSeating(Boolean(initial?.includesSeating))
    setError(null)
  }, [initial, open])

  const selectable = options.filter((option) => {
    if (option.tierType === "bundle") return false
    if (!includesSeating && option.tierType === "seated") return false
    return true
  })

  const priceById = useMemo(
    () => Object.fromEntries(selectable.concat(options).map((o) => [o.id, o.price])),
    [options, selectable],
  )

  const originalPrice = regularBundlePrice(items, priceById)
  const sale = Math.max(0, Number(price) || 0)
  const savings = bundleSavings(originalPrice, sale)

  function addItem(tierId?: string) {
    const option =
      selectable.find((item) => item.id === tierId) ?? selectable[0]
    if (!option) return
    setItems((current) => {
      const existing = current.find((item) => item.tierId === option.id)
      if (existing) {
        return current.map((item) =>
          item.tierId === option.id
            ? { ...item, quantity: Math.min(50, item.quantity + 1) }
            : item,
        )
      }
      return [...current, { tierId: option.id, quantity: 1 }]
    })
  }

  function includeOnePerDay() {
    const generals = selectable.filter((option) => option.tierType === "general")
    if (scheduleDays.length > 1) {
      const byDay = scheduleDays
        .map((day) => generals.find((option) => option.dayId === day.id))
        .filter((option): option is BundleComponentOption => Boolean(option))
      if (byDay.length > 0) {
        setItems(byDay.map((option) => ({ tierId: option.id, quantity: 1 })))
        return
      }
    }
    const first = generals[0]
    if (first) {
      setItems([{ tierId: first.id, quantity: Math.max(2, scheduleDays.length) }])
    }
  }

  function applyVolumePreset(buy: number) {
    const first =
      selectable.find((option) => option.tierType === "general") ?? selectable[0]
    if (!first) return
    setItems([{ tierId: first.id, quantity: buy }])
    const regular = first.price * buy
    const pay = Math.max(0, (buy - 1) * first.price)
    setPrice(String(pay))
    setName((current) => current.trim() || `Pack ${buy}x${buy - 1} ${first.name}`)
  }

  function submit() {
    const draft: BundleCreatorValue = {
      name: name.trim(),
      bundleType,
      price: sale,
      originalPrice,
      capacity: Math.max(1, Math.floor(Number(capacity) || 1)),
      items,
      includesSeating,
    }
    const invalid = validateBundleDraft(draft)
    if (invalid) {
      setError(invalid)
      return
    }
    onSave(draft)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-card text-foreground sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            En menos de 2 minutos: tipo, qué incluye, precio promocional y cupo.
            El stock de cada ítem se reserva 8 minutos al comprar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bundle-name">Nombre del combo / abono</Label>
            <Input
              id="bundle-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Abono 3 Días + Estacionamiento VIP"
              className="h-11"
            />
          </div>

          <div className="grid gap-2">
            {(Object.keys(BUNDLE_TYPE_LABELS) as BundleType[]).map((type) => {
              const Icon = TYPE_ICONS[type]
              const selected = bundleType === type
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setBundleType(type)}
                  className={cn(
                    "flex gap-3 rounded-2xl border p-3 text-left transition",
                    selected
                      ? "border-emerald-500/40 bg-emerald-500/10"
                      : "border-border bg-muted/40 hover:border-emerald-500/25",
                  )}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-800 dark:text-emerald-300">
                    <Icon className="size-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-foreground">
                      {BUNDLE_TYPE_LABELS[type]}
                    </span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                      {BUNDLE_TYPE_HINTS[type]}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="flex items-start justify-between gap-3 rounded-2xl border border-border px-3 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                Incluye mapa / mesas numeradas
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Descuenta cupo de mesas o butacas. El comprador no elige asiento
                en el mapa: es un pack de capacidad.
              </p>
            </div>
            <Switch
              checked={includesSeating}
              onCheckedChange={setIncludesSeating}
              className="data-checked:bg-emerald-500"
            />
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Qué incluye</Label>
              <div className="flex flex-wrap gap-2">
                {bundleType === "multi_day_pass" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={includeOnePerDay}
                  >
                    <CalendarDays className="size-3.5" />
                    Un general por jornada
                  </Button>
                ) : null}
                {bundleType === "volume_discount" ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => applyVolumePreset(2)}
                    >
                      2x1
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => applyVolumePreset(4)}
                    >
                      4x3
                    </Button>
                  </>
                ) : null}
              </div>
            </div>

            {items.map((item) => {
              const option = options.find((row) => row.id === item.tierId)
              return (
                <div
                  key={item.tierId}
                  className="grid grid-cols-[1fr_4.5rem_auto] gap-2"
                >
                  <select
                    className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                    value={item.tierId}
                    onChange={(event) =>
                      setItems((current) =>
                        current.map((row) =>
                          row.tierId === item.tierId
                            ? { ...row, tierId: event.target.value }
                            : row,
                        ),
                      )
                    }
                  >
                    {selectable.map((optionRow) => (
                      <option key={optionRow.id} value={optionRow.id}>
                        {optionRow.name} · {formatCurrency(optionRow.price)}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={item.quantity}
                    onChange={(event) =>
                      setItems((current) =>
                        current.map((row) =>
                          row.tierId === item.tierId
                            ? {
                                ...row,
                                quantity: Math.max(
                                  1,
                                  Number(event.target.value) || 1,
                                ),
                              }
                            : row,
                        ),
                      )
                    }
                    className="h-10"
                    aria-label="Cantidad"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setItems((current) =>
                        current.filter((row) => row.tierId !== item.tierId),
                      )
                    }
                    aria-label="Quitar"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                  {option?.tierType === "addon" ? (
                    <p className="col-span-3 -mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Car className="size-3" /> Extra / servicio
                    </p>
                  ) : option?.tierType === "seated" ? (
                    <p className="col-span-3 -mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Armchair className="size-3" /> Descuenta mesas del mapa
                    </p>
                  ) : (
                    <p className="col-span-3 -mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Ticket className="size-3" /> {option?.name}
                    </p>
                  )}
                </div>
              )
            })}

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={selectable.length === 0}
              onClick={() => addItem()}
            >
              <Plus className="size-3.5" />
              Agregar componente
            </Button>
            {selectable.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Creá primero entradas generales o adicionales para armar el combo.
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="bundle-price">Precio promocional</Label>
              <Input
                id="bundle-price"
                type="number"
                min={0}
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bundle-stock">Límite de stock</Label>
              <Input
                id="bundle-stock"
                type="number"
                min={1}
                value={capacity}
                onChange={(event) => setCapacity(event.target.value)}
                className="h-11"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm">
            <p className="flex items-center gap-2 font-medium text-foreground">
              <Sparkles className="size-4 text-emerald-600 dark:text-emerald-300" />
              Precio regular {formatCurrency(originalPrice)}
              {savings.amount > 0
                ? ` · Ahorrás ${formatCurrency(savings.amount)} (${savings.percent}%)`
                : ""}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              El comprador paga el precio promocional. Al confirmar el pago se
              emiten los QR de cada ítem incluido.
            </p>
          </div>

          {error ? (
            <p className="text-sm text-red-500" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="button" disabled={pending} onClick={submit}>
            {pending ? <LoaderCircle className="animate-spin" /> : null}
            Guardar combo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
