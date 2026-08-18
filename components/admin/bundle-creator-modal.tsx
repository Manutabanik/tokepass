"use client"

import {
  Armchair,
  Car,
  LoaderCircle,
  Percent,
  Plus,
  Sparkles,
  Ticket,
  Trash2,
} from "lucide-react"
import { useMemo, useState } from "react"

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
import { formatCurrency } from "@/lib/format"
import {
  PROMO_DISCOUNT_LABELS,
  PROMO_DISCOUNT_TYPES,
  PROMO_TEMPLATE_2X1,
  PROMO_TEMPLATE_SECOND_HALF,
  bundleSavings,
  inferBundleType,
  inferPromoRule,
  normalizePromoRule,
  promotionalBundlePrice,
  regularBundlePrice,
  validateBundleDraft,
  type BundleComponent,
  type BundleType,
  type PromoRule,
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
  promoRule: PromoRule
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

export function BundleCreatorModal({
  open,
  onOpenChange,
  title = "Crear combo promocional",
  options,
  initial,
  pending = false,
  onSave,
}: Props) {
  const [name, setName] = useState("")
  const [capacity, setCapacity] = useState("50")
  const [items, setItems] = useState<BundleComponent[]>([])
  const [rule, setRule] = useState<PromoRule>(normalizePromoRule(null))
  const [error, setError] = useState<string | null>(null)
  const seedKey = open ? JSON.stringify(initial ?? null) : "closed"
  const [appliedSeed, setAppliedSeed] = useState(seedKey)
  if (seedKey !== appliedSeed) {
    setAppliedSeed(seedKey)
    if (open) {
      setName(initial?.name ?? "")
      setCapacity(String(initial?.capacity ?? 50))
      setItems(initial?.items ?? [])
      setRule(
        inferPromoRule({
          rule: initial?.promoRule?.tipoDescuento
            ? initial.promoRule
            : null,
          bundleType: initial?.bundleType,
          items: initial?.items,
          salePrice: initial?.price,
          regularPrice: initial?.originalPrice,
        }),
      )
      setError(null)
    }
  }

  const selectable = options.filter((option) => option.tierType !== "bundle")
  const priceById = useMemo(
    () => Object.fromEntries(options.map((option) => [option.id, option.price])),
    [options],
  )
  const originalPrice = regularBundlePrice(items, priceById)
  const sale = promotionalBundlePrice({
    items,
    unitPriceByTierId: priceById,
    rule,
  })
  const savings = bundleSavings(originalPrice, sale)
  const bundleType = inferBundleType({
    bundleType: rule.tipoDescuento === "X_POR_Y" ? "volume_discount" : undefined,
    items,
    componentTierTypes: Object.fromEntries(
      options.map((option) => [option.id, option.tierType]),
    ),
  })

  function updateRule(patch: Partial<PromoRule>) {
    setRule((current) => normalizePromoRule({ ...current, ...patch }))
  }

  function applyTemplate(next: PromoRule, label: string) {
    const normalized = normalizePromoRule(next)
    setRule(normalized)
    const first =
      selectable.find((option) => option.tierType === "general") ?? selectable[0]
    if (first) {
      setItems([{ tierId: first.id, quantity: normalized.cantidadRequerida }])
      setName((current) => current.trim() || `${label} · ${first.name}`)
    }
    setError(null)
  }

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

  function submit() {
    const draft: BundleCreatorValue = {
      name: name.trim(),
      bundleType,
      price: sale,
      originalPrice,
      capacity: Math.max(1, Math.floor(Number(capacity) || 1)),
      items,
      includesSeating: items.some((item) => {
        const option = options.find((row) => row.id === item.tierId)
        return option?.tierType === "seated"
      }),
      promoRule: rule,
    }
    const invalid = validateBundleDraft({ ...draft, rule })
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
            Elegí una plantilla o una regla. El precio promocional se calcula
            solo a partir de las entradas incluidas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bundle-name">Nombre del combo</Label>
            <Input
              id="bundle-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="2x1 General · Viernes"
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <Label>Plantillas rápidas</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                className="h-auto justify-start px-3 py-3 text-left"
                onClick={() => applyTemplate(PROMO_TEMPLATE_2X1, "2x1")}
              >
                <span>
                  <span className="block text-sm font-semibold">Crear 2x1</span>
                  <span className="block text-xs text-muted-foreground">
                    Llevá 2, pagá 1
                  </span>
                </span>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-auto justify-start px-3 py-3 text-left"
                onClick={() =>
                  applyTemplate(PROMO_TEMPLATE_SECOND_HALF, "50% 2ª unidad")
                }
              >
                <span>
                  <span className="block text-sm font-semibold">
                    50% en la 2ª unidad
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    La segunda entra a mitad de precio
                  </span>
                </span>
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tipo de promoción</Label>
            <div className="grid gap-2">
              {PROMO_DISCOUNT_TYPES.map((type) => {
                const selected = rule.tipoDescuento === type
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => updateRule({ tipoDescuento: type })}
                    className={cn(
                      "rounded-2xl border p-3 text-left text-sm font-semibold transition",
                      selected
                        ? "border-emerald-500/40 bg-emerald-500/10"
                        : "border-border bg-muted/40 hover:border-emerald-500/25",
                    )}
                  >
                    {PROMO_DISCOUNT_LABELS[type]}
                  </button>
                )
              })}
            </div>
          </div>

          {rule.tipoDescuento === "PORCENTAJE" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="promo-percent">Descuento (%)</Label>
                <Input
                  id="promo-percent"
                  type="number"
                  min={0}
                  max={100}
                  value={rule.valorDescuento}
                  onChange={(event) =>
                    updateRule({
                      valorDescuento: Number(event.target.value) || 0,
                    })
                  }
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="promo-nth">Aplicar en la unidad N</Label>
                <Input
                  id="promo-nth"
                  type="number"
                  min={1}
                  max={50}
                  value={rule.cantidadRequerida}
                  onChange={(event) =>
                    updateRule({
                      cantidadRequerida: Number(event.target.value) || 1,
                    })
                  }
                  className="h-11"
                />
                <p className="text-xs text-muted-foreground">
                  1 = todo el pack. 2 = solo la 2ª unidad.
                </p>
              </div>
            </div>
          ) : null}

          {rule.tipoDescuento === "MONTO_FIJO" ? (
            <div className="space-y-1.5">
              <Label htmlFor="promo-fixed">Monto a descontar</Label>
              <Input
                id="promo-fixed"
                type="number"
                min={0}
                value={rule.valorDescuento}
                onChange={(event) =>
                  updateRule({
                    valorDescuento: Number(event.target.value) || 0,
                  })
                }
                className="h-11"
              />
            </div>
          ) : null}

          {rule.tipoDescuento === "X_POR_Y" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="promo-buy">Cantidad requerida (X)</Label>
                <Input
                  id="promo-buy"
                  type="number"
                  min={2}
                  max={50}
                  value={rule.cantidadRequerida}
                  onChange={(event) =>
                    updateRule({
                      cantidadRequerida: Number(event.target.value) || 2,
                    })
                  }
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="promo-pay">Cantidad que paga (Y)</Label>
                <Input
                  id="promo-pay"
                  type="number"
                  min={1}
                  max={49}
                  value={rule.cantidadPaga}
                  onChange={(event) =>
                    updateRule({
                      cantidadPaga: Number(event.target.value) || 1,
                    })
                  }
                  className="h-11"
                />
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>Entradas incluidas</Label>
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
              Agregar entrada
            </Button>
            {selectable.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Creá primero una entrada general para armar la promoción.
              </p>
            ) : null}
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

          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Sparkles className="size-4 text-emerald-600 dark:text-emerald-300" />
              Precio calculado
            </p>
            <div className="mt-2 flex flex-wrap items-baseline gap-3">
              <span className="text-sm text-muted-foreground line-through">
                {formatCurrency(originalPrice)}
              </span>
              <span className="text-2xl font-black tabular-nums text-foreground">
                {formatCurrency(sale)}
              </span>
              {savings.amount > 0 ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  <Percent className="size-3" />
                  Ahorro {formatCurrency(savings.amount)} ({savings.percent}%)
                </span>
              ) : null}
            </div>
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
